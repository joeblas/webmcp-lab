import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  ArrowLeft,
  ArrowRight,
  Bug,
  Loader2,
  Plug,
  PlugZap,
  RotateCw,
  Settings2
} from 'lucide-react'
import type { NavState, WebMCPState } from '../../../shared/types'

interface TopBarProps {
  nav: NavState
  webmcp: WebMCPState
  onOpenSettings: () => void
}

export function TopBar({ nav, webmcp, onOpenSettings }: TopBarProps): React.JSX.Element {
  const [draft, setDraft] = useState(nav.url)
  const [lastNavUrl, setLastNavUrl] = useState(nav.url)
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Follow the tab's URL unless the user is editing (state adjusted during render).
  if (nav.url !== lastNavUrl) {
    setLastNavUrl(nav.url)
    if (!focused) setDraft(nav.url)
  }

  const submit = (): void => {
    if (draft.trim()) {
      window.api.navigate(draft)
      inputRef.current?.blur()
    }
  }

  return (
    <header className="flex h-12 shrink-0 items-center gap-1.5 border-b px-2">
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={!nav.canGoBack}
        onClick={() => window.api.goBack()}
        aria-label="Back"
      >
        <ArrowLeft />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={!nav.canGoForward}
        onClick={() => window.api.goForward()}
        aria-label="Forward"
      >
        <ArrowRight />
      </Button>
      <Button variant="ghost" size="icon-sm" onClick={() => window.api.reload()} aria-label="Reload">
        {nav.loading ? <Loader2 className="animate-spin" /> : <RotateCw />}
      </Button>

      <form
        className="flex min-w-0 flex-1 items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <Input
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={(event) => {
            setFocused(true)
            event.target.select()
          }}
          onBlur={() => setFocused(false)}
          placeholder="Load a page that registers WebMCP tools (https://… or localhost:5173)"
          className="h-8 font-mono text-xs"
          spellCheck={false}
        />
      </form>

      {nav.failure && (
        <span className="max-w-48 truncate text-xs text-destructive">{nav.failure}</span>
      )}

      <WebMCPBadge webmcp={webmcp} loading={nav.loading} />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => window.api.openGuestDevTools()}
            aria-label="Open page DevTools"
          >
            <Bug />
          </Button>
        </TooltipTrigger>
        <TooltipContent>DevTools for the loaded page</TooltipContent>
      </Tooltip>
      <Button variant="ghost" size="icon-sm" onClick={onOpenSettings} aria-label="Settings">
        <Settings2 />
      </Button>
    </header>
  )
}

function WebMCPBadge({
  webmcp,
  loading
}: {
  webmcp: WebMCPState
  loading: boolean
}): React.JSX.Element {
  if (webmcp.probedAt === 0 || loading) {
    return (
      <Badge variant="outline" className="shrink-0 gap-1 text-muted-foreground">
        <Loader2 className="size-3 animate-spin" />
        WebMCP
      </Badge>
    )
  }
  if (!webmcp.supported) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="destructive" className="shrink-0 gap-1">
            <Plug className="size-3" />
            WebMCP unavailable
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-72">{webmcp.reason}</TooltipContent>
      </Tooltip>
    )
  }
  return (
    <Badge className="shrink-0 gap-1 bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/15">
      <PlugZap className="size-3" />
      WebMCP · {webmcp.tools.length} tool{webmcp.tools.length === 1 ? '' : 's'}
    </Badge>
  )
}
