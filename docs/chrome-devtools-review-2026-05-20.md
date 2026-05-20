# Chrome DevTools Review - 2026-05-20

## Scope

This review used the Chrome DevTools MCP server against the local Vite dev server. Initial review ran at `http://localhost:5173/`; follow-up verification used `http://localhost:5177/` because the original 5173 server was still running without the latest COOP/COEP headers.

Verified paths:

- Desktop shell: `http://localhost:5173/`
- Browser storage test runner: `http://localhost:5173/test.html`
- Terminal runtime: `http://localhost:5177/terminal.html`
- Local plugin manifest installation path: `http://localhost:5173/manifest.json`

Build verification:

```bash
npm run build
```

Result: production build completed successfully. Follow-up build completed with 49 transformed modules and no Pyodide externalization warnings.

## Browser Verification Matrix

| Area | Result | Evidence |
| --- | --- | --- |
| Desktop shell load | Pass | Main page rendered Vortex OS menu bar, Storage Tests icon, Dock, FPS meter, and clock. |
| Kernel runtime | Pass | `window.vortexKernel` exists and orchestrator reported `running: true`. |
| Storage engine tests | Pass | `test.html` reported 11/11 `[PASS]`, including concurrent writes, auto-save, crash recovery, capability checks, manifest token checks, and VFS listing. |
| Terminal route | Pass | `terminal.html` loads WebContainer with `crossOriginIsolated === true`; `npm config get prefix` returns `/home/.npm-global`. |
| Window launcher | Pass | Dock buttons open Dashboard, Files, and Terminal; repeated Dock clicks focus the existing system window instead of spawning duplicates. |
| Local plugin installation | Pass | The bundled `manifest.json` now accepts `kb-mcp:read` and `kb-mcp:write` permission tokens. |
| KB-MCP Settings | Pass | Settings saves KB ID and API key presence, hides the raw key after save, and exposes a Check KB status action. |
| Console errors | Partial | Main page shows a non-blocking `favicon.ico` 404. Test and terminal routes had no blocking console errors. |
| Network load | Partial | Core JS modules load with 200/304; favicon request returns 404. |

## Findings

### Blocking: bundled plugin manifest cannot install

The local manifest declares:

```json
"permissions": [
  "kb-mcp:read",
  "kb-mcp:write"
]
```

`plugin-installer.js` validates permissions with a token pattern that rejects a hyphen in the namespace before the first colon. Direct browser evaluation of `installManifest(location.origin + '/manifest.json')` returned:

```text
Manifest contains an invalid permission token: "kb-mcp:read"
```

Impact: the bundled `AI Data Analyzer` plugin cannot be installed through the Add App flow, so the KB-MCP plugin path cannot be exercised from the UI.

Recommended fix: update the permission token grammar to allow hyphenated capability namespaces, then add a regression test for `kb-mcp:read` and `kb-mcp:write`.

### Resolved: KB-MCP runtime configuration is available in Settings

The KB proxy requires `vortex_kb_api_key` and `vortex_kb_id` in localStorage. The only exposed setup path is:

```javascript
window.vortexKernel.configureKb({ apiKey: 'YOUR_KEY', kbId: 'YOUR_KB_ID' })
```

Resolution: Settings now provides KB ID and API key inputs plus a Check KB action. The saved raw API key is never re-rendered in the field after save.

### Resolved: Dock system apps open and focus correctly

Dashboard, Files, and Terminal Dock icons open system app windows. Clicking an already-open system app restores/focuses the existing window instead of creating duplicates.

### Low: favicon request returns 404

The main route requests `/favicon.ico`, which currently returns 404.

Impact: non-blocking console and network noise during every browser review.

Recommended fix: add a small favicon asset or explicit favicon link.

## Current Known Partial Implementations

- Optional v86 Linux mode still requires `libv86.js`, `v86.wasm`, BIOS files, and an image asset before the `linux` command can start a real-kernel VM.
- KB-MCP live success still requires a valid user-provided KB ID and API key; request-failed states are surfaced in Settings.

## Verification Commands

```bash
curl -I --max-time 2 http://localhost:5173/
npm run build
```

Chrome DevTools MCP checks used:

- `new_page`
- `take_snapshot`
- `evaluate_script`
- `wait_for`
- `list_console_messages`
- `list_network_requests`
