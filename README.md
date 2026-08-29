# WebMCP Lab

A desktop developer tool for a fast test/iterate loop on web apps that register
[WebMCP](https://developer.chrome.com/docs/ai/webmcp) tools: load your page in a
**real Chromium tab with WebMCP enabled**, see the tools it registers on
`document.modelContext`, run them manually, and chat with a bring-your-own-key
model that can call them — while you watch the live page react.

This exists because most embedded browsers (including Cursor's) can't flip
Chromium feature flags, so there is nowhere convenient to _talk to your page_
while you build WebMCP tools. Electron can pass `--enable-features=WebMCP` to
its Chromium, so this app gives you the loop: edit your app → reload the tab →
tools refresh via `toolchange` → run/chat again.

Not a generic MCP server, not an agent platform, not a DevTools clone (Chrome
already has an Application → WebMCP inspect panel — this is the _talk-to-it_
side).

## Run it

```sh
pnpm install
pnpm dev
```

Requires Node 20+ and pnpm. `pnpm dev` launches the Electron window; the URL
bar defaults to the fixture page
[verdant.joebgallegos.workers.dev](https://verdant.joebgallegos.workers.dev),
a garden sim that registers its tools on `document.modelContext`. Paste your
own dev server (`localhost:5173` — localhost is a secure context) or any HTTPS
page instead.

### Linux/dev-only switches

Some Linux boxes (headless CI, containers, no SUID sandbox helper, no GPU)
need Chromium's usual environment hacks. They are **not** product flags and
the app defaults to running without them:

```sh
pnpm dev:linux-hacks   # electron-vite dev -- --no-sandbox --disable-gpu
```

## How the WebMCP switch works

Electron 44.0.0 ships Chromium 152.0.7977.54, which has the WebMCP imperative
API behind a feature flag. `src/main/index.ts` enables it **before**
`app.ready` — this ordering is load-bearing:

```ts
app.commandLine.appendSwitch('enable-features', 'WebMCP')
```

What you get in a page (verified against this exact Electron build; see
`scripts/webmcp-probe.cjs`):

- `document.modelContext` — the API lives on `document`.
  `navigator.modelContext` was removed in Chromium 152.0.7943.0 and is
  `undefined` here.
- `getTools({ fromOrigins? })` → registered tools with `name`, `title`,
  `description`, `inputSchema` (**a JSON string** in Blink), `origin`,
  `annotations` (`readOnlyHint`, `untrustedContentHint`, and Blink's
  `consequentialHint`).
- `executeTool(tool, inputArguments)` where **`inputArguments` is a JSON
  string**, resolving to `string | null` (`null` when the call caused a
  navigation). The CG spec draft shows an object form — a real tab does not
  accept it, and neither does this app.
- `toolchange` events on `modelContext`; there is no `unregisterTool()` —
  pages abort the `registerTool` signal instead.
- Gating: secure context + Permissions-Policy `tools` (default `'self'`).

Local TypeScript declarations for all of this live in
`src/shared/webmcp-dom.d.ts` until the TS DOM lib ships them.

## How the host talks to the page

The chat/host side **only** talks to the page through `document.modelContext`
in the guest page's main world (`webContents.executeJavaScript`):

- After each load — and on every `toolchange` — a probe calls `getTools()` and
  returns a JSON-serializable snapshot (never the live `Window` handle Blink
  puts on each tool).
- Executing a tool re-runs `getTools()` in the guest, finds the tool by name,
  and calls `executeTool(tool, JSON.stringify(args))`.
- No CDP `WebMCP.invokeTool`, no reaching into the page's store, no injected
  preload in the guest tab (it stays fully sandboxed).

When `document.modelContext` is missing (flag off, insecure context, old
Chromium), the UI shows a clear badge + banner explaining why.

## BYOK chat

Settings (gear icon) take an OpenAI-compatible **base URL**, **API key**, and
**model id** — nothing is baked in. The key is stored on disk in the app's
user-data directory, encrypted via the OS keychain (`safeStorage`) when
available, in a chmod-600 file otherwise, and is never sent to the renderer.

Chat streams responses and executes the model's tool calls against the live
page, showing each call's status, arguments, and result inline. Without a key,
chat shows a setup empty state — but the **Tools** tab always works: it lists
every registered tool with its schema and annotations and lets you run it with
hand-written JSON arguments.

## Headless verification

```sh
pnpm probe                                    # normal
pnpm exec electron scripts/webmcp-probe.cjs --no-sandbox --disable-gpu  # Linux CI
```

`scripts/webmcp-probe.cjs` opens a hidden window, loads verdant, asserts the
switch order and API shape (including that `navigator.modelContext` is gone),
and executes `get_garden_state` through the JSON-string signature. Exit code 0
means the whole contract holds in this Electron build.

## Stack

Electron 44.0.0 (Chromium 152 is the floor for WebMCP) · React 19 · Vite via
electron-vite · TypeScript · Tailwind v4 · shadcn/ui, including the official
shadcn chat components (`message-scroller`, `message`, `bubble`, `attachment`,
`marker`) · pnpm.
