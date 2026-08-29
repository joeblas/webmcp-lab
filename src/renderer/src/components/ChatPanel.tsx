import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Bubble, BubbleContent } from '@/components/ui/bubble'
import { Message, MessageContent } from '@/components/ui/message'
import { Marker, MarkerContent, MarkerIcon } from '@/components/ui/marker'
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport
} from '@/components/ui/message-scroller'
import { useChat, type ChatItem } from '@/hooks/use-chat'
import { prettyJson } from '@/lib/format'
import {
  ArrowUp,
  ChevronDown,
  CircleCheck,
  CircleX,
  Eraser,
  KeyRound,
  Loader2,
  Sparkles,
  Square,
  TriangleAlert,
  Wrench
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ChatPanelProps {
  hasApiKey: boolean
  onOpenSettings: () => void
}

const EXAMPLE_PROMPTS = [
  'What tools does this page expose, and what do they do?',
  'Inspect the current page state using its tools.',
  'Pick a safe read-only tool and run it.'
]

export function ChatPanel({ hasApiKey, onOpenSettings }: ChatPanelProps): React.JSX.Element {
  const { items, sending, send, stop, clear } = useChat()
  const [draft, setDraft] = useState('')

  const submit = (): void => {
    if (!draft.trim() || sending) return
    send(draft)
    setDraft('')
  }

  if (!hasApiKey && items.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <KeyRound className="size-5 text-muted-foreground" />
        </div>
        <h2 className="text-sm font-semibold">Bring your own key</h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Point WebMCP Lab at any OpenAI-compatible endpoint (base URL, API key, and model) and the
          chat can call the tools this page registers. Until then, run tools manually from the Tools
          tab.
        </p>
        <Button size="sm" onClick={onOpenSettings}>
          Configure model
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <MessageScrollerProvider autoScroll>
        <MessageScroller className="flex-1">
          <MessageScrollerViewport className="px-3 py-4" aria-label="Chat messages">
            <MessageScrollerContent className="gap-4">
              {items.length === 0 && (
                <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
                  <Sparkles className="size-5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">
                    Ask about the page — the model can call every WebMCP tool it registers, and you
                    can watch the live page react.
                  </p>
                  <div className="flex w-full flex-col gap-1.5">
                    {EXAMPLE_PROMPTS.map((prompt) => (
                      <Button
                        key={prompt}
                        variant="outline"
                        size="sm"
                        className="h-auto justify-start whitespace-normal py-2 text-left text-xs font-normal text-muted-foreground"
                        onClick={() => send(prompt)}
                      >
                        {prompt}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              {items.map((item) => (
                <MessageScrollerItem key={item.id} messageId={item.id}>
                  <ChatItemView item={item} />
                </MessageScrollerItem>
              ))}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>

      <div className="shrink-0 border-t p-2">
        <form
          className="flex items-end gap-1.5"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                submit()
              }
            }}
            placeholder={hasApiKey ? 'Ask the page to do something…' : 'Configure a model first'}
            disabled={!hasApiKey}
            rows={2}
            className="max-h-32 min-h-9 resize-none text-sm"
          />
          <div className="flex flex-col gap-1">
            {items.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={clear}
                disabled={sending}
                aria-label="Clear conversation"
              >
                <Eraser />
              </Button>
            )}
            {sending ? (
              <Button
                type="button"
                variant="secondary"
                size="icon-sm"
                onClick={stop}
                aria-label="Stop"
              >
                <Square />
              </Button>
            ) : (
              <Button
                type="submit"
                size="icon-sm"
                disabled={!draft.trim() || !hasApiKey}
                aria-label="Send"
              >
                <ArrowUp />
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

function ChatItemView({ item }: { item: ChatItem }): React.JSX.Element {
  switch (item.kind) {
    case 'user':
      return (
        <Message align="end">
          <MessageContent>
            <Bubble align="end">
              <BubbleContent className="whitespace-pre-wrap">{item.text}</BubbleContent>
            </Bubble>
          </MessageContent>
        </Message>
      )
    case 'assistant':
      return (
        <Message>
          <MessageContent>
            <Bubble variant="muted">
              <BubbleContent className="whitespace-pre-wrap">
                {item.text}
                {item.streaming && (
                  <span className="ml-1 inline-block size-2 animate-pulse rounded-full bg-foreground/60 align-middle" />
                )}
              </BubbleContent>
            </Bubble>
          </MessageContent>
        </Message>
      )
    case 'tool':
      return <ToolCallMarker item={item} />
    case 'error':
      return (
        <Marker>
          <MarkerIcon>
            <TriangleAlert className="text-destructive" />
          </MarkerIcon>
          <MarkerContent className="text-destructive">{item.text}</MarkerContent>
        </Marker>
      )
  }
}

function ToolCallMarker({
  item
}: {
  item: Extract<ChatItem, { kind: 'tool' }>
}): React.JSX.Element {
  const [open, setOpen] = useState(false)

  return (
    <div className="flex flex-col gap-1.5">
      <Marker asChild>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="rounded-md px-1 py-0.5 hover:bg-muted/50"
        >
          <MarkerIcon>
            {item.status === 'running' ? (
              <Loader2 className="animate-spin" />
            ) : item.status === 'done' ? (
              <CircleCheck className="text-emerald-400" />
            ) : (
              <CircleX className="text-destructive" />
            )}
          </MarkerIcon>
          <MarkerContent className="flex min-w-0 items-center gap-1.5">
            <Wrench className="size-3 shrink-0 opacity-60" />
            <code className="truncate font-mono text-xs">{item.name}</code>
            <span className="shrink-0 text-xs opacity-70">
              {item.status === 'running' ? 'running…' : item.status === 'done' ? 'done' : 'failed'}
            </span>
          </MarkerContent>
          <ChevronDown
            className={cn('size-3.5 shrink-0 transition-transform', open && 'rotate-180')}
          />
        </button>
      </Marker>
      {open && (
        <div className="flex flex-col gap-1.5 pl-6">
          <ResultBlock label="Arguments" text={prettyJson(item.argsJson)} />
          {item.status === 'done' && (
            <ResultBlock
              label="Result"
              text={item.result == null ? 'null (page navigated)' : prettyJson(item.result)}
            />
          )}
          {item.status === 'error' && (
            <ResultBlock label="Error" text={item.error ?? 'Unknown error'} destructive />
          )}
        </div>
      )}
    </div>
  )
}

function ResultBlock({
  label,
  text,
  destructive
}: {
  label: string
  text: string
  destructive?: boolean
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <pre
        className={cn(
          'max-h-48 overflow-auto rounded-md border bg-muted/40 p-2 font-mono text-[11px] leading-snug whitespace-pre-wrap break-all',
          destructive && 'border-destructive/40 text-destructive'
        )}
      >
        {text}
      </pre>
    </div>
  )
}
