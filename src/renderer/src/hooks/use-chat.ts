import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatEvent, OpenAIMessage } from '../../../shared/types'

export type ChatItem =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'assistant'; id: string; text: string; streaming: boolean }
  | {
      kind: 'tool'
      id: string
      callId: string
      name: string
      argsJson: string
      status: 'running' | 'done' | 'error'
      result?: string | null
      error?: string
    }
  | { kind: 'error'; id: string; text: string }

interface UseChatResult {
  items: ChatItem[]
  sending: boolean
  send: (text: string) => void
  stop: () => void
  clear: () => void
}

let nextId = 0
const id = (): string => `item_${++nextId}`

export function useChat(): UseChatResult {
  const [items, setItems] = useState<ChatItem[]>([])
  const [sending, setSending] = useState(false)
  const historyRef = useRef<OpenAIMessage[]>([])

  useEffect(() => {
    return window.api.onChatEvent((event: ChatEvent) => {
      setItems((current) => applyEvent(current, event))
    })
  }, [])

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || sending) return
      setSending(true)
      setItems((current) => [...current, { kind: 'user', id: id(), text: trimmed }])
      const messages: OpenAIMessage[] = [...historyRef.current, { role: 'user', content: trimmed }]
      void window.api
        .chatSend(messages)
        .then((result) => {
          historyRef.current = result.messages ?? messages
        })
        .finally(() => setSending(false))
    },
    [sending]
  )

  const stop = useCallback(() => window.api.chatAbort(), [])

  const clear = useCallback(() => {
    historyRef.current = []
    setItems([])
  }, [])

  return { items, sending, send, stop, clear }
}

function applyEvent(items: ChatItem[], event: ChatEvent): ChatItem[] {
  switch (event.type) {
    case 'assistant-delta': {
      const last = items[items.length - 1]
      if (last?.kind === 'assistant' && last.streaming) {
        return [...items.slice(0, -1), { ...last, text: last.text + event.text }]
      }
      return [...items, { kind: 'assistant', id: id(), text: event.text, streaming: true }]
    }
    case 'assistant-done': {
      const last = items[items.length - 1]
      if (last?.kind === 'assistant' && last.streaming) {
        if (!event.text) return items.slice(0, -1)
        return [...items.slice(0, -1), { ...last, text: event.text, streaming: false }]
      }
      if (!event.text) return items
      return [...items, { kind: 'assistant', id: id(), text: event.text, streaming: false }]
    }
    case 'tool-call':
      return [
        ...items,
        {
          kind: 'tool',
          id: id(),
          callId: event.callId,
          name: event.name,
          argsJson: event.argsJson,
          status: 'running'
        }
      ]
    case 'tool-result':
      return items.map((item) =>
        item.kind === 'tool' && item.callId === event.callId && item.status === 'running'
          ? {
              ...item,
              status: event.ok ? 'done' : 'error',
              result: event.result,
              error: event.error
            }
          : item
      )
    case 'error':
      return [...items, { kind: 'error', id: id(), text: event.message }]
    case 'done':
      return items
  }
}
