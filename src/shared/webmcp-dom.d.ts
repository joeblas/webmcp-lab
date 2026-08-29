/**
 * Local ambient types for the WebMCP imperative API as shipped in Blink
 * (Chromium 152, behind --enable-features=WebMCP). TypeScript's DOM lib does
 * not ship these yet.
 *
 * These match what a real tab does (Blink HEAD + Chrome imperative-api docs),
 * NOT the WebMCP CG spec draft:
 *  - the API lives on `document.modelContext` (`navigator.modelContext` was
 *    removed in Chromium 152.0.7943.0)
 *  - `RegisteredTool.inputSchema` is a DOMString (JSON text), not an object
 *  - `executeTool(tool, inputArguments)` takes the arguments as a JSON
 *    *string* and resolves to `string | null` (null when the tool call caused
 *    a navigation). Do not use the spec's object form.
 */

interface WebMCPToolAnnotations {
  readonly readOnlyHint?: boolean
  readonly untrustedContentHint?: boolean
  /** Blink-only addition, not in the CG spec. */
  readonly consequentialHint?: boolean
}

interface WebMCPRegisteredTool {
  readonly name: string
  readonly title?: string
  readonly description?: string
  /** JSON Schema serialized as a DOMString in Blink. */
  readonly inputSchema?: string
  readonly origin?: string
  /** Live Window handle — never serialize or send across IPC. */
  readonly window?: Window | null
  readonly annotations?: WebMCPToolAnnotations
}

interface WebMCPToolRegistration {
  name: string
  title?: string
  description?: string
  inputSchema?: unknown
  annotations?: WebMCPToolAnnotations
  execute?: (input: unknown) => unknown
}

interface WebMCPRegisterToolOptions {
  signal?: AbortSignal
  exposedTo?: string
}

interface WebMCPGetToolsOptions {
  fromOrigins?: string[]
}

interface ModelContext extends EventTarget {
  registerTool(tool: WebMCPToolRegistration, options?: WebMCPRegisterToolOptions): void
  getTools(
    options?: WebMCPGetToolsOptions
  ): WebMCPRegisteredTool[] | Promise<WebMCPRegisteredTool[]>
  /** inputArguments MUST be a JSON string. Resolves to string | null. */
  executeTool(tool: WebMCPRegisteredTool, inputArguments: string): Promise<string | null>
  ontoolchange: ((this: ModelContext, ev: Event) => unknown) | null
}

interface Document {
  /** Present only when Chromium runs with --enable-features=WebMCP in a secure context. */
  readonly modelContext?: ModelContext
}
