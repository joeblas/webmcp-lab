import type {
  ChatEvent,
  ChatSendResult,
  ExecResult,
  OpenAIMessage,
  OpenAIToolCall,
  ToolDescriptor
} from '../shared/types'

interface ChatEngineDeps {
  getCredentials(): { baseUrl: string; apiKey: string | null; model: string }
  getTools(): ToolDescriptor[]
  getPageInfo(): { url: string; title: string }
  executeTool(name: string, argsJson: string): Promise<ExecResult>
}

interface OpenAIToolSpec {
  type: 'function'
  function: { name: string; description?: string; parameters: unknown }
}

const MAX_TOOL_ROUNDS = 10

/**
 * BYOK agent loop against any OpenAI-compatible /chat/completions endpoint.
 * Streams assistant text, executes WebMCP tool calls on the live page, feeds
 * results back, and repeats until the model stops calling tools.
 */
export class ChatEngine {
  private deps: ChatEngineDeps
  private abortController: AbortController | null = null

  constructor(deps: ChatEngineDeps) {
    this.deps = deps
  }

  abort(): void {
    this.abortController?.abort()
  }

  get running(): boolean {
    return this.abortController !== null
  }

  async run(history: OpenAIMessage[], emit: (event: ChatEvent) => void): Promise<ChatSendResult> {
    const { baseUrl, apiKey, model } = this.deps.getCredentials()
    if (!baseUrl || !apiKey || !model) {
      const error = 'Chat is not configured. Set a base URL, API key, and model in Settings.'
      emit({ type: 'error', message: error })
      return { ok: false, error }
    }
    if (this.abortController) {
      const error = 'A chat request is already running.'
      emit({ type: 'error', message: error })
      return { ok: false, error }
    }

    this.abortController = new AbortController()
    const signal = this.abortController.signal
    const messages: OpenAIMessage[] = [...history]
    // OpenAI function names must match ^[a-zA-Z0-9_-]{1,64}$; map sanitized -> real.
    const nameMap = new Map<string, string>()
    const tools = this.buildToolSpecs(nameMap)

    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const request = [
          { role: 'system', content: this.systemPrompt() } as OpenAIMessage,
          ...messages
        ]
        const { content, toolCalls } = await this.streamCompletion(
          { baseUrl, apiKey, model, messages: request, tools, signal },
          emit
        )
        emit({ type: 'assistant-done', text: content })
        messages.push({
          role: 'assistant',
          content: content || null,
          ...(toolCalls.length ? { tool_calls: toolCalls } : {})
        })

        if (!toolCalls.length) break

        for (const call of toolCalls) {
          const realName = nameMap.get(call.function.name) ?? call.function.name
          emit({
            type: 'tool-call',
            callId: call.id,
            name: realName,
            argsJson: call.function.arguments
          })
          const result = await this.deps.executeTool(realName, call.function.arguments || '{}')
          emit({
            type: 'tool-result',
            callId: call.id,
            ok: result.ok,
            result: result.result,
            error: result.error
          })
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: result.ok
              ? (result.result ?? 'null (the tool call caused a page navigation)')
              : `Tool execution failed: ${result.error}`
          })
        }
      }
      emit({ type: 'done' })
      return { ok: true, messages }
    } catch (err) {
      const message =
        err instanceof Error && err.name === 'AbortError'
          ? 'Stopped.'
          : err instanceof Error
            ? err.message
            : String(err)
      emit({ type: 'error', message })
      return { ok: false, error: message, messages }
    } finally {
      this.abortController = null
    }
  }

  private systemPrompt(): string {
    const page = this.deps.getPageInfo()
    const toolCount = this.deps.getTools().length
    return [
      'You are the assistant inside WebMCP Lab, a developer tool for testing web pages that register WebMCP tools.',
      `You are connected to the live page "${page.title || 'untitled'}" (${page.url || 'no page loaded'}) rendered in a real Chromium tab next to this chat.`,
      `The page currently registers ${toolCount} tool(s) on document.modelContext. Your function tools map 1:1 to them; calling one executes it on the live page and the user watches the page react.`,
      'Prefer calling tools over guessing page state. Report tool errors honestly. Be concise.'
    ].join('\n')
  }

  private buildToolSpecs(nameMap: Map<string, string>): OpenAIToolSpec[] {
    const used = new Set<string>()
    return this.deps.getTools().map((tool) => {
      let sanitized = tool.name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'tool'
      while (used.has(sanitized)) sanitized = `${sanitized.slice(0, 60)}_${used.size}`
      used.add(sanitized)
      nameMap.set(sanitized, tool.name)

      let parameters: unknown = { type: 'object', properties: {} }
      if (tool.inputSchema) {
        try {
          parameters = JSON.parse(tool.inputSchema)
        } catch {
          // Keep the permissive default if the page's schema string is invalid JSON.
        }
      }
      return {
        type: 'function' as const,
        function: {
          name: sanitized,
          description: [tool.title, tool.description].filter(Boolean).join(' — ') || undefined,
          parameters
        }
      }
    })
  }

  private async streamCompletion(
    options: {
      baseUrl: string
      apiKey: string
      model: string
      messages: OpenAIMessage[]
      tools: OpenAIToolSpec[]
      signal: AbortSignal
    },
    emit: (event: ChatEvent) => void
  ): Promise<{ content: string; toolCalls: OpenAIToolCall[] }> {
    const endpoint = `${options.baseUrl.replace(/\/+$/, '')}/chat/completions`
    const response = await fetch(endpoint, {
      method: 'POST',
      signal: options.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${options.apiKey}`
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        ...(options.tools.length ? { tools: options.tools } : {}),
        stream: true
      })
    })

    if (!response.ok || !response.body) {
      const body = await response.text().catch(() => '')
      throw new Error(
        `${endpoint} responded ${response.status} ${response.statusText}${body ? `: ${truncate(body, 400)}` : ''}`
      )
    }

    let content = ''
    const toolCallsByIndex = new Map<number, { id: string; name: string; args: string }>()

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const rawLine of lines) {
        const line = rawLine.trim()
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (!payload || payload === '[DONE]') continue
        let chunk: {
          choices?: {
            delta?: {
              content?: string | null
              tool_calls?: {
                index?: number
                id?: string
                function?: { name?: string; arguments?: string }
              }[]
            }
          }[]
          error?: { message?: string }
        }
        try {
          chunk = JSON.parse(payload)
        } catch {
          continue
        }
        if (chunk.error?.message) throw new Error(chunk.error.message)
        const delta = chunk.choices?.[0]?.delta
        if (!delta) continue
        if (delta.content) {
          content += delta.content
          emit({ type: 'assistant-delta', text: delta.content })
        }
        for (const tc of delta.tool_calls ?? []) {
          const index = tc.index ?? 0
          const entry = toolCallsByIndex.get(index) ?? { id: '', name: '', args: '' }
          if (tc.id) entry.id = tc.id
          if (tc.function?.name) entry.name += tc.function.name
          if (tc.function?.arguments) entry.args += tc.function.arguments
          toolCallsByIndex.set(index, entry)
        }
      }
    }

    const toolCalls: OpenAIToolCall[] = [...toolCallsByIndex.entries()]
      .sort(([a], [b]) => a - b)
      .map(([index, entry]) => ({
        id: entry.id || `call_${index}`,
        type: 'function' as const,
        function: { name: entry.name, arguments: entry.args || '{}' }
      }))
      .filter((call) => call.function.name)

    return { content, toolCalls }
  }
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}
