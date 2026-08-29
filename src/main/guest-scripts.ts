/**
 * Functions injected into the guest page's MAIN world via
 * webContents.executeJavaScript (`(${fn.toString()})(...)`). Everything they
 * return must be JSON-serializable — in particular, never the live Window
 * handle Blink puts on RegisteredTool.
 *
 * They are written as real TypeScript functions (typed against
 * src/shared/webmcp-dom.d.ts) so the compiler checks them, and serialized
 * with .toString() at injection time. They must stay self-contained: no
 * captured imports or module-level values.
 */

export const TOOLCHANGE_SENTINEL = '__WEBMCP_LAB_TOOLCHANGE__'

export interface ProbeResult {
  supported: boolean
  reason?: string
  tools: {
    name: string
    title?: string
    description?: string
    inputSchema?: string
    origin?: string
    annotations?: {
      readOnlyHint?: boolean
      untrustedContentHint?: boolean
      consequentialHint?: boolean
    }
  }[]
}

export interface GuestExecResult {
  ok: boolean
  result?: string | null
  error?: string
}

/**
 * Feature-detects document.modelContext, installs a toolchange forwarder
 * (once per document) that logs a sentinel the host listens for, and returns
 * a serializable snapshot of getTools().
 */
export async function probeModelContext(sentinel: string): Promise<ProbeResult> {
  const mc = document.modelContext
  if (!mc) {
    return {
      supported: false,
      reason: window.isSecureContext
        ? 'document.modelContext is undefined — WebMCP feature flag is off or this Chromium is too old'
        : 'document.modelContext is undefined — this page is not a secure context (WebMCP requires HTTPS or localhost)',
      tools: []
    }
  }
  if (!('registerTool' in mc)) {
    return {
      supported: false,
      reason:
        'document.modelContext exists but registerTool is missing — unexpected Chromium build',
      tools: []
    }
  }

  const globalWithFlag = window as Window & { __webmcpLabToolchangeHooked?: boolean }
  if (!globalWithFlag.__webmcpLabToolchangeHooked) {
    globalWithFlag.__webmcpLabToolchangeHooked = true
    try {
      mc.addEventListener('toolchange', () => {
        // The host filters console-message events for this exact string.
        console.log(sentinel)
      })
    } catch {
      // toolchange not implemented — the host just won't auto-refresh.
    }
  }

  let registered: WebMCPRegisteredTool[]
  try {
    registered = await Promise.resolve(mc.getTools())
  } catch (err) {
    return {
      supported: true,
      reason: `getTools() threw: ${err instanceof Error ? err.message : String(err)}`,
      tools: []
    }
  }

  return {
    supported: true,
    tools: registered.map((tool) => ({
      name: String(tool.name ?? ''),
      title: tool.title == null ? undefined : String(tool.title),
      description: tool.description == null ? undefined : String(tool.description),
      inputSchema:
        typeof tool.inputSchema === 'string'
          ? tool.inputSchema
          : tool.inputSchema == null
            ? undefined
            : JSON.stringify(tool.inputSchema),
      origin: tool.origin == null ? undefined : String(tool.origin),
      annotations: tool.annotations
        ? {
            readOnlyHint: tool.annotations.readOnlyHint ?? undefined,
            untrustedContentHint: tool.annotations.untrustedContentHint ?? undefined,
            consequentialHint: tool.annotations.consequentialHint ?? undefined
          }
        : undefined
    }))
  }
}

/**
 * Finds a registered tool by name and executes it through
 * modelContext.executeTool with the arguments as a JSON string (the Blink
 * signature — not the spec's object form).
 */
export async function executeModelContextTool(
  name: string,
  argsJson: string
): Promise<GuestExecResult> {
  const mc = document.modelContext
  if (!mc) {
    return { ok: false, error: 'document.modelContext is undefined on this page' }
  }
  try {
    const registered = await Promise.resolve(mc.getTools())
    const tool = registered.find((t) => t.name === name)
    if (!tool) {
      return { ok: false, error: `No registered tool named "${name}" on this page` }
    }
    const result = await mc.executeTool(tool, argsJson)
    return { ok: true, result }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    }
  }
}
