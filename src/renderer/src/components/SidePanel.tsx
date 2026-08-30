import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChatPanel } from '@/components/ChatPanel'
import { ToolsPanel } from '@/components/ToolsPanel'
import type { SettingsPublic, WebMCPState } from '../../../shared/types'
import { MessageSquare, Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SidePanelProps {
  webmcp: WebMCPState
  settings: SettingsPublic | null
  onOpenSettings: () => void
}

export function SidePanel({ webmcp, settings, onOpenSettings }: SidePanelProps): React.JSX.Element {
  const [tab, setTab] = useState<'chat' | 'tools'>('chat')

  return (
    <aside className="flex w-[400px] shrink-0 flex-col border-l">
      <div className="flex shrink-0 items-center gap-1 border-b p-2">
        <TabButton active={tab === 'chat'} onClick={() => setTab('chat')}>
          <MessageSquare className="size-3.5" />
          Chat
        </TabButton>
        <TabButton active={tab === 'tools'} onClick={() => setTab('tools')}>
          <Wrench className="size-3.5" />
          Tools
          <Badge variant="secondary" className="ml-0.5 h-4 min-w-4 px-1 text-[10px]">
            {webmcp.tools.length}
          </Badge>
        </TabButton>
      </div>
      <div className="min-h-0 flex-1">
        <div hidden={tab !== 'chat'} className="h-full">
          <ChatPanel
            hasApiKey={Boolean(settings?.hasApiKey && settings.model)}
            onOpenSettings={onOpenSettings}
          />
        </div>
        <div hidden={tab !== 'tools'} className="h-full">
          <ToolsPanel webmcp={webmcp} />
        </div>
      </div>
    </aside>
  )
}

function TabButton({
  active,
  onClick,
  children
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Button
      variant={active ? 'secondary' : 'ghost'}
      size="sm"
      onClick={onClick}
      className={cn('flex-1 gap-1.5', !active && 'text-muted-foreground')}
    >
      {children}
    </Button>
  )
}
