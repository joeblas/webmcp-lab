import { useEffect, useState } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import {
  DEFAULT_URL,
  type NavState,
  type SettingsPublic,
  type WebMCPState
} from '../../shared/types'
import { TopBar } from '@/components/TopBar'
import { BrowserPane } from '@/components/BrowserPane'
import { SidePanel } from '@/components/SidePanel'
import { SettingsDialog } from '@/components/SettingsDialog'
import { TriangleAlert } from 'lucide-react'

// Module-level guard so React StrictMode's double effect doesn't load twice.
let bootNavigated = false

export default function App(): React.JSX.Element {
  const [nav, setNav] = useState<NavState>({
    url: '',
    title: '',
    loading: true,
    canGoBack: false,
    canGoForward: false
  })
  const [webmcp, setWebmcp] = useState<WebMCPState>({ supported: false, tools: [], probedAt: 0 })
  const [settings, setSettings] = useState<SettingsPublic | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const setSettingsOpenAndToggleGuest = (open: boolean): void => {
    setSettingsOpen(open)
    // The guest WebContentsView paints above the renderer, so it must be
    // hidden while the modal is up or it would cover the dialog.
    window.api.setGuestVisible(!open)
  }

  useEffect(() => {
    const unsubNav = window.api.onNavState(setNav)
    const unsubState = window.api.onWebMCPState(setWebmcp)
    void window.api.getSettings().then(setSettings)
    if (!bootNavigated) {
      bootNavigated = true
      window.api.navigate(DEFAULT_URL)
    }
    return () => {
      unsubNav()
      unsubState()
    }
  }, [])

  const showUnsupportedBanner = webmcp.probedAt > 0 && !webmcp.supported

  return (
    <TooltipProvider>
      <div className="flex h-screen flex-col bg-background text-foreground">
        <TopBar
          nav={nav}
          webmcp={webmcp}
          onOpenSettings={() => setSettingsOpenAndToggleGuest(true)}
        />
        {showUnsupportedBanner && (
          <div className="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-xs text-amber-500">
            <TriangleAlert className="size-3.5 shrink-0" />
            <span className="min-w-0 truncate">
              WebMCP unavailable on this page — {webmcp.reason ?? 'unknown reason'}
            </span>
          </div>
        )}
        <div className="flex min-h-0 flex-1">
          <BrowserPane />
          <SidePanel
            webmcp={webmcp}
            settings={settings}
            onOpenSettings={() => setSettingsOpenAndToggleGuest(true)}
          />
        </div>
      </div>
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpenAndToggleGuest}
        settings={settings}
        onSaved={setSettings}
      />
    </TooltipProvider>
  )
}
