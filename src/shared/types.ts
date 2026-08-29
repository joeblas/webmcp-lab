/** Serializable descriptor of a tool registered on the guest page's document.modelContext. */
export interface ToolAnnotations {
  readOnlyHint?: boolean
  untrustedContentHint?: boolean
  consequentialHint?: boolean
}

export interface ToolDescriptor {
  name: string
  title?: string
  description?: string
  /** JSON Schema as a string — Blink exposes inputSchema as a DOMString. */
  inputSchema?: string
  origin?: string
  annotations?: ToolAnnotations
}

export interface WebMCPState {
  supported: boolean
  /** Human-readable reason when supported is false (flag off, insecure context, old Chromium). */
  reason?: string
  tools: ToolDescriptor[]
  probedAt: number
}

export interface NavState {
  url: string
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  failure?: string
}

export interface ExecResult {
  ok: boolean
  /** executeTool resolves to string | null (null when the call caused a navigation). */
  result?: string | null
  error?: string
}

export interface SettingsPublic {
  baseUrl: string
  model: string
  hasApiKey: boolean
  encryptionAvailable: boolean
}

export interface SettingsUpdate {
  baseUrl?: string
  model?: string
  /** New key, or null to clear the stored key. Omit to keep the current one. */
  apiKey?: string | null
}

export type OpenAIToolCall = {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export type OpenAIMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: OpenAIToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string }

export type ChatEvent =
  | { type: 'assistant-delta'; text: string }
  | { type: 'assistant-done'; text: string }
  | { type: 'tool-call'; callId: string; name: string; argsJson: string }
  | { type: 'tool-result'; callId: string; ok: boolean; result?: string | null; error?: string }
  | { type: 'done' }
  | { type: 'error'; message: string }

export interface ChatSendResult {
  ok: boolean
  /** Full updated OpenAI-format history (input + everything appended during the run). */
  messages?: OpenAIMessage[]
  error?: string
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export const DEFAULT_URL = 'https://verdant.joebgallegos.workers.dev'
