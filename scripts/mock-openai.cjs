/**
 * Minimal OpenAI-compatible mock for exercising the BYOK chat loop without a
 * real key. Streams SSE like a real /chat/completions endpoint:
 *   - first turn: a tool call to get_garden_state with "{}"
 *   - after a tool result arrives: a short text answer quoting it
 *
 * Run: node scripts/mock-openai.cjs   (listens on http://127.0.0.1:43191/v1)
 * Then in WebMCP Lab settings: base URL http://127.0.0.1:43191/v1, any key,
 * model "mock".
 */
const http = require('http')

const PORT = 43191

function sse(res, chunks) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  })
  let index = 0
  const timer = setInterval(() => {
    if (index >= chunks.length) {
      res.write('data: [DONE]\n\n')
      res.end()
      clearInterval(timer)
      return
    }
    res.write(`data: ${JSON.stringify(chunks[index++])}\n\n`)
  }, 40)
}

const delta = (payload, finish = null) => ({
  id: 'chatcmpl-mock',
  object: 'chat.completion.chunk',
  choices: [{ index: 0, delta: payload, finish_reason: finish }]
})

http
  .createServer((req, res) => {
    if (!req.url.endsWith('/chat/completions')) {
      res.writeHead(404).end()
      return
    }
    let body = ''
    req.on('data', (part) => (body += part))
    req.on('end', () => {
      const { messages = [] } = JSON.parse(body || '{}')
      const hasToolResult = messages.some((m) => m.role === 'tool')

      if (!hasToolResult) {
        sse(res, [
          delta({ role: 'assistant', content: 'Let me check the garden state.' }),
          delta({
            tool_calls: [
              {
                index: 0,
                id: 'call_mock_1',
                type: 'function',
                function: { name: 'get_garden_state', arguments: '' }
              }
            ]
          }),
          delta({ tool_calls: [{ index: 0, function: { arguments: '{}' } }] }),
          delta({}, 'tool_calls')
        ])
        return
      }

      const toolText = String(messages.findLast((m) => m.role === 'tool')?.content ?? '')
      const summary = toolText.match(/Garden state:[^"\\]*/)?.[0] ?? toolText.slice(0, 120)
      const words = `Here is what the page reported — ${summary}`.split(/(?<= )/)
      sse(res, [
        delta({ role: 'assistant', content: '' }),
        ...words.map((word) => delta({ content: word })),
        delta({}, 'stop')
      ])
    })
  })
  .listen(PORT, '127.0.0.1', () => {
    console.log(`mock OpenAI endpoint on http://127.0.0.1:${PORT}/v1`)
  })
