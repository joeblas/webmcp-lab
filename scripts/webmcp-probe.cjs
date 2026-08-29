/**
 * Headless proof that the WebMCP switch order and Blink API shape work in
 * this exact Electron build — no UI, no mocks, a real Chromium renderer.
 *
 * Run:
 *   pnpm probe
 *   # or, on a Linux box/CI without a GPU or SUID sandbox helper:
 *   pnpm exec electron scripts/webmcp-probe.cjs --no-sandbox --disable-gpu
 *
 * It verifies, against a live page (verdant by default):
 *   1. `enable-features=WebMCP` appended BEFORE app.ready enables the API
 *   2. document.modelContext exists; navigator.modelContext does NOT
 *      (removed in Chromium 152.0.7943.0)
 *   3. getTools() returns the page's registered tools
 *   4. executeTool(tool, JSON string) — the Blink signature — round-trips
 */
const { app, BrowserWindow } = require('electron')

// MUST run before app.ready or the feature never reaches the renderer.
app.commandLine.appendSwitch('enable-features', 'WebMCP')

const TARGET_URL = process.env.PROBE_URL || 'https://verdant.joebgallegos.workers.dev'
const EXEC_TOOL = process.env.PROBE_TOOL || 'get_garden_state'

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
  })

  try {
    await win.loadURL(TARGET_URL)

    const probe = await win.webContents.executeJavaScript(
      `(async () => {
        const mc = document.modelContext
        const base = {
          chromium: (navigator.userAgent.match(/Chrome\\/([\\d.]+)/) || [])[1] || 'unknown',
          documentModelContext: typeof mc,
          navigatorModelContext: typeof navigator.modelContext,
          secureContext: window.isSecureContext
        }
        if (!mc || !('registerTool' in mc)) return { ...base, supported: false, toolNames: [] }
        const tools = await Promise.resolve(mc.getTools())
        return { ...base, supported: true, toolNames: tools.map((t) => t.name) }
      })()`,
      true
    )

    console.log('--- WebMCP probe ---')
    console.log(JSON.stringify(probe, null, 2))

    let execOk = !probe.toolNames.includes(EXEC_TOOL)
    if (probe.supported && probe.toolNames.includes(EXEC_TOOL)) {
      const result = await win.webContents.executeJavaScript(
        `(async () => {
          const mc = document.modelContext
          const tools = await Promise.resolve(mc.getTools())
          const tool = tools.find((t) => t.name === ${JSON.stringify(EXEC_TOOL)})
          // Blink signature: inputArguments is a JSON *string*, not an object.
          const out = await mc.executeTool(tool, JSON.stringify({}))
          return out
        })()`,
        true
      )
      execOk = typeof result === 'string' || result === null
      console.log(`--- executeTool("${EXEC_TOOL}", "{}") ---`)
      console.log(typeof result === 'string' ? result.slice(0, 600) : String(result))
    }

    const pass = probe.supported && probe.navigatorModelContext === 'undefined' && execOk
    console.log(pass ? 'PROBE PASSED' : 'PROBE FAILED')
    app.exit(pass ? 0 : 1)
  } catch (err) {
    console.error('PROBE FAILED:', err)
    app.exit(1)
  }
})
