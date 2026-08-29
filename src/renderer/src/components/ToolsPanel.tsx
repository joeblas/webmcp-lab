import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Attachment,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle
} from '@/components/ui/attachment'
import { prettyJson } from '@/lib/format'
import type { ExecResult, ToolDescriptor, WebMCPState } from '../../../shared/types'
import {
  ChevronDown,
  CircleCheck,
  CircleX,
  Loader2,
  Play,
  RefreshCw,
  Wrench
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ToolsPanelProps {
  webmcp: WebMCPState
}

export function ToolsPanel({ webmcp }: ToolsPanelProps): React.JSX.Element {
  const [refreshing, setRefreshing] = useState(false)

  const refresh = (): void => {
    setRefreshing(true)
    void window.api.refreshTools().finally(() => setRefreshing(false))
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b px-3 py-2">
        <span className="text-xs text-muted-foreground">
          {webmcp.supported
            ? `${webmcp.tools.length} tool${webmcp.tools.length === 1 ? '' : 's'} on document.modelContext`
            : 'document.modelContext unavailable'}
        </span>
        <Button variant="ghost" size="icon-xs" onClick={refresh} aria-label="Refresh tools">
          <RefreshCw className={cn(refreshing && 'animate-spin')} />
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {webmcp.tools.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <Wrench className="size-5 text-muted-foreground/50" />
            <p className="text-xs text-muted-foreground">
              {webmcp.supported
                ? 'This page has not registered any tools yet. Tools appear here the moment the page calls registerTool().'
                : (webmcp.reason ?? 'Load a page to probe for WebMCP tools.')}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 p-2">
            {webmcp.tools.map((tool) => (
              <ToolCard key={tool.name} tool={tool} />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}

function ToolCard({ tool }: { tool: ToolDescriptor }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [args, setArgs] = useState('{}')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<ExecResult | null>(null)

  const run = (): void => {
    setRunning(true)
    setResult(null)
    void window.api
      .executeTool(tool.name, args.trim() || '{}')
      .then(setResult)
      .finally(() => setRunning(false))
  }

  return (
    <div className="rounded-lg border bg-card">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-start gap-2 rounded-lg p-2.5 text-left hover:bg-muted/40"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <code className="truncate font-mono text-xs font-semibold">{tool.name}</code>
            {tool.annotations?.readOnlyHint && (
              <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                read-only
              </Badge>
            )}
            {tool.annotations?.consequentialHint && (
              <Badge variant="destructive" className="h-4 px-1 text-[10px]">
                consequential
              </Badge>
            )}
            {tool.annotations?.untrustedContentHint && (
              <Badge variant="outline" className="h-4 px-1 text-[10px]">
                untrusted content
              </Badge>
            )}
          </div>
          {tool.title && <span className="truncate text-xs text-foreground/80">{tool.title}</span>}
          {tool.description && (
            <span className={cn('text-xs text-muted-foreground', !open && 'line-clamp-2')}>
              {tool.description}
            </span>
          )}
        </div>
        <ChevronDown
          className={cn(
            'mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180'
          )}
        />
      </button>

      {open && (
        <div className="flex flex-col gap-2 border-t p-2.5">
          {tool.inputSchema && (
            <details className="group">
              <summary className="cursor-pointer text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Input schema
              </summary>
              <pre className="mt-1 max-h-40 overflow-auto rounded-md border bg-muted/40 p-2 font-mono text-[11px] leading-snug whitespace-pre-wrap break-all">
                {prettyJson(tool.inputSchema)}
              </pre>
            </details>
          )}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Arguments (JSON string passed to executeTool)
            </span>
            <Textarea
              value={args}
              onChange={(event) => setArgs(event.target.value)}
              rows={2}
              spellCheck={false}
              className="min-h-9 resize-y font-mono text-xs"
            />
          </div>
          <Button size="sm" onClick={run} disabled={running} className="gap-1.5 self-start">
            {running ? <Loader2 className="animate-spin" /> : <Play />}
            Run tool
          </Button>

          {(running || result) && (
            <Attachment
              state={running ? 'processing' : result?.ok ? 'done' : 'error'}
              className="w-full"
            >
              <AttachmentMedia>
                {running ? (
                  <Loader2 className="animate-spin" />
                ) : result?.ok ? (
                  <CircleCheck className="text-emerald-400" />
                ) : (
                  <CircleX className="text-destructive" />
                )}
              </AttachmentMedia>
              <AttachmentContent>
                <AttachmentTitle>
                  {running ? 'Executing on the page…' : result?.ok ? 'Result' : 'Execution failed'}
                </AttachmentTitle>
                <AttachmentDescription>
                  {running
                    ? `executeTool("${tool.name}", …)`
                    : result?.ok
                      ? result.result == null
                        ? 'Returned null — the call caused a navigation'
                        : `${result.result.length} chars returned by the page`
                      : (result?.error ?? 'Unknown error')}
                </AttachmentDescription>
              </AttachmentContent>
            </Attachment>
          )}
          {result?.ok && result.result != null && (
            <pre className="max-h-56 overflow-auto rounded-md border bg-muted/40 p-2 font-mono text-[11px] leading-snug whitespace-pre-wrap break-all">
              {prettyJson(result.result)}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
