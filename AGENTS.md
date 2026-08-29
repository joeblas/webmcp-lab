# Agent notes for WebMCP Lab

## Verify against a real Electron window — never by mocking modelContext

WebMCP here means the Blink implementation in the exact Chromium that Electron
44.0.0 ships (152.0.7977.54), behind `--enable-features=WebMCP`. Its shape has
already diverged from the CG spec once (`navigator.modelContext` →
`document.modelContext`; `executeTool` takes a JSON **string**, not an
object), so a mock of `document.modelContext` proves nothing and will drift.

To verify any change to the probe/execute path:

1. `pnpm probe` (add `--no-sandbox --disable-gpu` after the script path on
   headless Linux). It loads https://verdant.joebgallegos.workers.dev in a
   hidden real window and exits 0 only if the full contract holds:
   `document.modelContext` present, `navigator.modelContext` absent,
   `getTools()` lists tools, `executeTool(tool, "{}")` returns a string.
2. For UI changes, run `pnpm dev` (or `pnpm dev:linux-hacks` on a headless
   box with Xvfb) and exercise the flow against verdant: tools listed in the
   Tools tab, a manual `get_garden_state` run with `{}` succeeds, and the
   tool list refreshes after reloading the page (toolchange → probe).

## Invariants that must not regress

- `app.commandLine.appendSwitch('enable-features', 'WebMCP')` stays **before**
  `app.whenReady()` in `src/main/index.ts`. After ready, the flag silently
  does nothing.
- All host↔page traffic goes through `document.modelContext` in the guest's
  **main world** via `webContents.executeJavaScript`
  (`src/main/guest-scripts.ts`). No CDP WebMCP domain, no guest preload, no
  reaching into the page's own stores, and never serialize the `window`
  property Blink puts on RegisteredTool.
- `executeTool` arguments are passed as a JSON string (Blink signature).
- `--no-sandbox` / `--disable-gpu` are environment hacks for headless Linux
  only. They stay out of the default `dev`/`start` scripts and out of
  `src/main/index.ts`.
- The functions in `src/main/guest-scripts.ts` are injected via
  `fn.toString()`: they must stay self-contained (no imports or captured
  values) and their local types in `src/shared/webmcp-dom.d.ts` must match
  Blink, not the spec draft.

## Checks

- `pnpm typecheck` must pass (`node` and `web` projects).
- `pnpm lint` for ESLint.
- Do not copy verdant garden code into this repo; it is a live fixture only.
