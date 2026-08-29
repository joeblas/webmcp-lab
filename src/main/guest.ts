import { BrowserWindow, WebContentsView } from 'electron'
import type { ExecResult, NavState, Rect, WebMCPState } from '../shared/types'
import {
  executeModelContextTool,
  probeModelContext,
  TOOLCHANGE_SENTINEL,
  type GuestExecResult,
  type ProbeResult
} from './guest-scripts'

interface GuestTabCallbacks {
  onWebMCPState(state: WebMCPState): void
  onNavState(state: NavState): void
}

/**
 * The WebMCP tab: a real Chromium WebContentsView showing the user's page.
 * The host only ever talks to it through document.modelContext in the page's
 * main world (executeJavaScript); no preload is injected into the guest.
 */
export class GuestTab {
  readonly view: WebContentsView
  private readonly callbacks: GuestTabCallbacks
  private probeTimer: NodeJS.Timeout | null = null
  private lastState: WebMCPState = { supported: false, tools: [], probedAt: 0 }
  private failure: string | undefined

  constructor(callbacks: GuestTabCallbacks) {
    this.callbacks = callbacks
    this.view = new WebContentsView({
      webPreferences: {
        // Arbitrary web content: keep the full Chromium sandbox, no Node, no preload.
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    })
    this.hookEvents()
  }

  get webContents(): Electron.WebContents {
    return this.view.webContents
  }

  get state(): WebMCPState {
    return this.lastState
  }

  attach(win: BrowserWindow): void {
    win.contentView.addChildView(this.view)
  }

  /** Hidden while renderer modals are open — the view always paints above the window's own content. */
  setVisible(visible: boolean): void {
    this.view.setVisible(visible)
  }

  setBounds(rect: Rect): void {
    this.view.setBounds({
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.max(0, Math.round(rect.width)),
      height: Math.max(0, Math.round(rect.height))
    })
  }

  navigate(rawUrl: string): void {
    const url = normalizeUrl(rawUrl)
    if (!url) return
    this.failure = undefined
    void this.webContents.loadURL(url).catch(() => {
      // did-fail-load reports the details; loadURL's rejection is redundant.
    })
  }

  async probe(): Promise<WebMCPState> {
    let result: ProbeResult
    try {
      result = (await this.webContents.executeJavaScript(
        `(${probeModelContext.toString()})(${JSON.stringify(TOOLCHANGE_SENTINEL)})`,
        true
      )) as ProbeResult
    } catch (err) {
      result = {
        supported: false,
        reason: `Probe failed: ${err instanceof Error ? err.message : String(err)}`,
        tools: []
      }
    }
    this.lastState = { ...result, probedAt: Date.now() }
    this.callbacks.onWebMCPState(this.lastState)
    return this.lastState
  }

  async executeTool(name: string, argsJson: string): Promise<ExecResult> {
    try {
      const result = (await this.webContents.executeJavaScript(
        `(${executeModelContextTool.toString()})(${JSON.stringify(name)}, ${JSON.stringify(argsJson)})`,
        true
      )) as GuestExecResult
      return result
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  openDevTools(): void {
    this.webContents.openDevTools({ mode: 'detach' })
  }

  private hookEvents(): void {
    const wc = this.webContents

    // Links that would open a new window navigate the tab instead.
    wc.setWindowOpenHandler(({ url }) => {
      this.navigate(url)
      return { action: 'deny' }
    })

    wc.on('did-start-loading', () => this.emitNav(true))
    wc.on('did-stop-loading', () => this.emitNav(false))
    wc.on('page-title-updated', () => this.emitNav(wc.isLoading()))

    wc.on('did-navigate', () => {
      this.failure = undefined
      this.emitNav(wc.isLoading())
    })

    wc.on('did-finish-load', () => {
      this.emitNav(false)
      this.scheduleProbe()
    })

    // SPA route changes don't fire did-finish-load; re-probe on them too.
    wc.on('did-navigate-in-page', (_event, _url, isMainFrame) => {
      if (isMainFrame) {
        this.emitNav(wc.isLoading())
        this.scheduleProbe()
      }
    })

    wc.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
      if (isMainFrame && code !== -3 /* ERR_ABORTED: normal on redirects */) {
        this.failure = `Failed to load (${description || code})`
        this.emitNav(false)
      }
    })

    // The injected toolchange listener logs a sentinel; catching it here is
    // how tool list changes on the page reach the host UI.
    wc.on('console-message', (...args: unknown[]) => {
      const [first, second] = args
      const message =
        typeof second === 'string'
          ? second
          : first && typeof first === 'object' && 'message' in first
            ? String((first as { message: unknown }).message)
            : undefined
      if (message === TOOLCHANGE_SENTINEL) this.scheduleProbe()
    })
  }

  /** Coalesces bursts of toolchange/navigation events into one probe. */
  private scheduleProbe(): void {
    if (this.probeTimer) clearTimeout(this.probeTimer)
    this.probeTimer = setTimeout(() => {
      this.probeTimer = null
      void this.probe()
    }, 150)
  }

  private emitNav(loading: boolean): void {
    const wc = this.webContents
    this.callbacks.onNavState({
      url: wc.getURL(),
      title: wc.getTitle(),
      loading,
      canGoBack: wc.navigationHistory.canGoBack(),
      canGoForward: wc.navigationHistory.canGoForward(),
      failure: this.failure
    })
  }
}

function normalizeUrl(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed
  // Bare host: assume http for localhost (still a secure context), https otherwise.
  const host = trimmed.split('/')[0]
  const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host)
  return `${isLocal ? 'http' : 'https'}://${trimmed}`
}
