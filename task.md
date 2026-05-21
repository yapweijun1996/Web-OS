# Vortex OS Development Backlog - JIRA Board

This document maps out the system backlog for Vortex OS in JIRA ticket format, specifying key features, architecture enhancements, security fixes, and integration benchmarks.

---

## 🗂️ Epic: WebAssembly Linux Core (Wasm VM)

### 🎫 Issue Key: VORTEX-101
* **Summary**: Integrate Web Worker-based v86 WebAssembly Alpine Linux VM
* **Issue Type**: Task
* **Priority**: High
* **Status**: Done
* **Description**: Implement a standalone Web Worker wrapper to boot a minimal WebAssembly Alpine Linux image. This offloads x86 instruction execution from the browser's UI thread. The worker must communicate with the host's `V86LinuxBridge` via `postMessage`.
* **Acceptance Criteria**:
  - Worker compiles and boots minimal Alpine (5-15MB) in under 3 seconds.
  - No dropped frames on main window dragging while terminal boots.
  - Successfully pipes Serial Out streams from the emulator back to the main thread.

---

## 🗂️ Epic: Virtual File System (VFS)

### 🎫 Issue Key: VORTEX-102
* **Summary**: Implement Transactional Sync and Auto-Save for JSONL.gz Storage
* **Issue Type**: Story
* **Priority**: Medium
* **Status**: Done
* **Description**: Create an auto-save loop in `CompressedStorageEngine` that tracks file state dirty bits. If a file is modified, compile updates in memory and perform a debounced transactional append into IndexedDB. Ensure no write collision occurs on simultaneous app writes.
* **Acceptance Criteria**:
  - Changes are auto-saved automatically after 500ms of user/app idle.
  - IndexedDB transaction successfully commits raw binary ArrayBuffer payload.
  - Reading the file immediately after crash simulation retrieves 100% of the appended lines without corruption.

---

## 🗂️ Epic: Plugin Sandbox Security

### 🎫 Issue Key: VORTEX-103
* **Summary**: Establish Reverse Proxy Engine for Installing Third-Party CORS-Protected Plugins
* **Issue Type**: Story
* **Priority**: High
* **Status**: Done
* **Description**: When installing an external app via Manifest URL, the host `fetch` will fail if the server does not declare `Access-Control-Allow-Origin: *`. Create a CORS bypass engine using a secure pre-configured proxy helper (e.g. cloudflare workers) or sandboxed URL rewriting.
* **Acceptance Criteria**:
  - Users can input external manifest links (e.g., from raw.githubusercontent.com) and fetch metadata.
  - Strict input sanitization applied to returned manifest attributes before parsing.
  - Manifest is rejected if the domain fails origin safety validation rules.

---

## 🗂️ Epic: AI Agent Core Integration

### 🎫 Issue Key: VORTEX-104
* **Summary**: Implement Event Hook Interceptors and Multi-Agent Orchestrator
* **Issue Type**: Story
* **Priority**: High
* **Status**: Done
* **Description**: Design system-level hooks inside the OS kernel. This allows a background Agent to listen to user operations (such as opening files, launching apps, and sending commands) and dynamically coordinate sub-agents using capability tokens.
* **Acceptance Criteria**:
  - Global event bus successfully exposes system triggers safely to the Agent listener.
  - Orchestrator Agent can securely request `fs:write` token and automatically compile reports in VFS without human intervention.

---

### 🎫 Issue Key: VORTEX-105
* **Summary**: Implement KB-MCP Integration for Browser-Based AI Agent
* **Issue Type**: Story
* **Priority**: High
* **Status**: Done
* **Description**: Integrate Vortex OS with the centralized KB-MCP server to provide persistent long-term semantic, episodic, and procedural memory to the in-browser AI Agent. Implement secure Host-side capability token verification ('kb-mcp:read', 'kb-mcp:write') before forwarding REST requests to https://kb.yapweijun1996.com.
* **Acceptance Criteria**:
  - Sandboxed plugin cannot access KB-MCP server without declaring 'kb-mcp:read' or 'kb-mcp:write' permissions.
  - Host OS successfully routes valid, tokenized messages over the MessageChannel IPC.
  - AI Agent successfully reads/writes vector items through the CORS-authorized Host proxy.

---

## 🗂️ Epic: WebAssembly Linux Core (Wasm VM)

### 🎫 Issue Key: VORTEX-106
* **Summary**: Resolve Terminal Iframe Direct Load and Missing Worker Assets
* **Issue Type**: Bug
* **Priority**: Critical
* **Status**: Done
* **Description**: Resolve the blank screen/script execution error caused by loading raw `v86-bridge.js` inside the Terminal iframe. Create a proper `terminal.html` plugin using a terminal emulator UI like `xterm.js`, and provide placeholder assets for `v86-worker.js` and `alpine.img`.
* **Acceptance Criteria**:
  - Clicking Terminal icon loads `terminal.html` rather than raw script.
  - `terminal.html` properly instantiates the MessageChannel and binds keys to standard input.
  - Loading of Web Worker does not fail with 404.

---

## 🗂️ Epic: Virtual File System (VFS)

### 🎫 Issue Key: VORTEX-107
* **Summary**: Implement VFS Concurrent Write Mutex Lock
* **Issue Type**: Story
* **Priority**: High
* **Status**: Done
* **Description**: Prevent data collisions and file corruption by designing an asynchronous transactional Mutex (Mutual Exclusion) lock mechanism inside `jsonl-storage-engine.js` so only one process can write to a file path at a time.
* **Acceptance Criteria**:
  - Concurrent writes to the same filePath are queued sequentially.
  - The queue resolves in order without throwing transactional abort errors.
  - Final concatenated Gzip file retains 100% data integrity under concurrent write stresses.

---

## 🗂️ Epic: Plugin Sandbox Security

### 🎫 Issue Key: VORTEX-108
* **Summary**: Implement CORS Proxy Bypass for Third-Party Manifest Fetching
* **Issue Type**: Task
* **Priority**: Medium
* **Status**: Done
* **Description**: Introduce a configurable CORS bypass proxy helper in `index.html` to allow downloading plugin manifests from remote non-CORS enabled servers.
* **Acceptance Criteria**:
  - Dynamic App installation successfully fetches manifests from third-party domains (e.g. raw.githubusercontent.com) without triggering CORS block.
  - The proxy path is configurable from the settings panel.
  - Robust sanitization applies to proxy response before parsing.

---

## 🗂️ Epic: Chrome DevTools Review Findings

### 🎫 Issue Key: VORTEX-109
* **Summary**: Fix Manifest Permission Token Grammar for KB-MCP Capabilities
* **Issue Type**: Bug
* **Priority**: Critical
* **Status**: Done
* **Description**: Chrome DevTools review on 2026-05-20 found that installing the bundled local `manifest.json` fails because `plugin-installer.js` rejects `kb-mcp:read`. The permission tokenizer currently does not allow hyphenated capability namespaces before the first colon.
* **Acceptance Criteria**:
  - Installing `http://localhost:5173/manifest.json` from the Add App modal succeeds.
  - `kb-mcp:read` and `kb-mcp:write` are accepted as valid permission tokens.
  - Malformed or unsafe permission strings are still rejected.
  - Regression coverage proves the bundled manifest can pass sanitization.

### 🎫 Issue Key: VORTEX-110
* **Summary**: Add User-Facing KB-MCP Configuration and Health Check
* **Issue Type**: Story
* **Priority**: High
* **Status**: Done
* **Description**: KB-MCP runtime setup currently requires `window.vortexKernel.configureKb({ apiKey, kbId })` from the browser console. Add a Settings UI section for KB-MCP configuration so users can configure and verify the integration without console access.
* **Acceptance Criteria**:
  - Settings can save KB ID and API key presence without rendering the raw saved key.
  - A health check reports configured, missing-key, missing-KB, and request-failed states clearly.
  - A sandboxed plugin can complete a `kb:read` request through the host proxy after configuration.
  - Unauthorized plugins continue to receive capability-denied errors.
* **Verification**:
  - Chrome DevTools MCP confirmed Settings saves KB ID and API key presence without re-rendering the raw saved key.
  - Missing configuration and configured-with-hidden-key states are reported in the Settings panel.
  - Live KB success still requires valid user-provided credentials.

### 🎫 Issue Key: VORTEX-111
* **Summary**: Wire or Disable Placeholder Dock Apps
* **Issue Type**: Task
* **Priority**: Medium
* **Status**: Done
* **Description**: Chrome DevTools review found the Dashboard and Files Dock icons render as first-class apps but have no click handlers.
* **Acceptance Criteria**:
  - Dashboard and Files either open functional windows or render as visibly unavailable.
  - Clicking every enabled Dock icon produces an observable result.
  - The behavior is covered by a browser smoke check.
* **Verification**:
  - Chrome DevTools MCP confirmed repeated Dashboard Dock clicks keep one window, and Dock click restores a minimized system window.

### 🎫 Issue Key: VORTEX-112
* **Summary**: Add Favicon Asset to Remove Browser 404 Noise
* **Issue Type**: Task
* **Priority**: Low
* **Status**: Done
* **Description**: The main route currently triggers a non-blocking `/favicon.ico` 404 in Chrome DevTools.
* **Acceptance Criteria**:
  - Loading `http://localhost:5173/` no longer produces a favicon 404.
  - Console and network reviews can distinguish real runtime issues from asset noise.

### 🎫 Issue Key: VORTEX-113
* **Summary**: Fix WebContainer npm Global Install Prefix
* **Issue Type**: Bug
* **Priority**: High
* **Status**: Done
* **Description**: Vortex OS Terminal ran `npm i -g @openai/codex` inside WebContainer and npm attempted to create package directories under `/usr/local/lib/node_modules`, causing an `EACCES` failure.
* **Acceptance Criteria**:
  - Global npm installs in Terminal use a writable WebContainer prefix.
  - `npm config get prefix` reports `/home/.npm-global`.
  - User-provided `--prefix` arguments are respected.
* **Verification**:
  - Chrome DevTools MCP confirmed `npm config get prefix` returns `/home/.npm-global`.
  - Chrome DevTools MCP confirmed `npm i -g @openai/codex` normalizes to include `--prefix /home/.npm-global`.

### 🎫 Issue Key: VORTEX-114
* **Summary**: Remove Pyodide Vite Build Warnings
* **Issue Type**: Task
* **Priority**: Medium
* **Status**: Done
* **Description**: Static Pyodide imports caused Vite production builds to warn about Node compatibility modules externalized for browser use.
* **Acceptance Criteria**:
  - Terminal still boots Pyodide on demand.
  - Production build completes without Pyodide externalization warnings.
* **Verification**:
  - `npm run build` completed successfully with no Pyodide externalization warnings.

### 🎫 Issue Key: VORTEX-115
* **Summary**: Execute npm Global Binaries from Terminal Shell
* **Issue Type**: Bug
* **Priority**: High
* **Status**: Done
* **Description**: After `npm i -g @openai/codex` succeeded in WebContainer, typing `codex` still returned `codex: command not found` because Vortex shell only dispatched built-in commands and did not route installed global npm binaries.
* **Acceptance Criteria**:
  - Unknown safe command names are checked against WebContainer global npm binary paths after WebContainer has booted.
  - Installed npm global binaries can be executed directly from Vortex shell.
  - Non-installed commands still return a shell-level `command not found`.
* **Verification**:
  - Chrome DevTools MCP confirmed `npm i -g cowsay` followed by `cowsay hello` renders cowsay output and does not print `command not found`.
  - Chrome DevTools MCP confirmed `npm i -g @openai/codex` followed by `codex --version` executes the installed binary and does not print `codex: command not found`.

### 🎫 Issue Key: VORTEX-116
* **Summary**: Handle Codex Native CLI Limitation in WebContainer
* **Issue Type**: Bug
* **Priority**: High
* **Status**: Done
* **Description**: After `npm i -g @openai/codex`, running `codex` reached the installed launcher but failed with `jsh: command not found: Cannot` and exit code 127 because the current Codex npm package starts a native Linux ELF binary that browser WebContainer cannot execute.
* **Acceptance Criteria**:
  - `codex` no longer falls through to the WebContainer shell/native binary failure.
  - The Terminal explains that Codex CLI must run in the host terminal or a real Linux VM, not browser WebContainer.
  - Other npm global binaries that are WebContainer-compatible still run through the existing global binary dispatch path.
* **Verification**:
  - Chrome DevTools MCP confirmed `codex` prints the native-binary compatibility message.
  - Chrome DevTools MCP confirmed `codex` output no longer contains `jsh: command not found: Cannot` or `Process exited with code 127`.

### 🎫 Issue Key: VORTEX-125
* **Summary**: Clarify Buildroot Linux VM Tooling Limits
* **Issue Type**: Bug
* **Priority**: Medium
* **Status**: Done
* **Description**: The `linux` command boots the default v86 Buildroot image successfully, but users can reasonably try package-install commands such as `curl -fsSL https://claude.ai/install.sh | bash`. The default image lacks `bash` and HTTPS-capable `curl`, producing confusing shell errors.
* **Acceptance Criteria**:
  - Terminal help explains that the default VM is Buildroot for kernel/serial checks.
  - Terminal points users to WebContainer/Pyodide for npm/pip workflows.
  - Docs record that full bash/HTTPS/package-manager support needs a prepared Alpine or Debian disk image.
* **Verification**:
  - `npm run build` completed successfully.
  - Chrome DevTools MCP confirmed `help` includes the Buildroot and Alpine/Debian image requirement.

### 🎫 Issue Key: VORTEX-126
* **Summary**: Add Prepared Alpine or Debian v86 Disk Image
* **Issue Type**: Story
* **Priority**: High
* **Status**: Done
* **Description**: Provide a real package-install Linux environment for v86 with `bash`, HTTPS-capable `curl`, CA certificates, and `apk`. The current default Buildroot image remains suitable for kernel boot validation only.
* **Acceptance Criteria**:
  - `linux alpine` boots an Alpine initramfs with `bash`, HTTPS-capable `curl`, CA certificates, and `apk`.
  - The image source, build process, checksum, and size are documented.
  - Terminal clearly distinguishes Buildroot demo mode from package workstation mode.
* **Verification**:
  - Added `scripts/build-alpine-initramfs.sh` to build `public/v86/alpine-initramfs.cpio.gz` from the official Alpine x86 minirootfs.
  - Added `scripts/resolve-alpine-apks.mjs` to resolve package dependencies from Alpine `APKINDEX`.
  - Added `linux alpine`, `linux buildroot`, and `linux help` Terminal command handling.
  - Documented the Alpine source URL, build command, artifact size, generated SHA-256, and relay limits.
  - Chrome DevTools MCP verified `linux alpine` boots Alpine `3.23.0`, exposes `/sbin/apk`, runs GNU bash `5.3.3`, runs curl `8.19.0` with `https` support, and receives DHCP lease `192.168.86.100` through v86 fetch relay.

### 🎫 Issue Key: VORTEX-127
* **Summary**: Add WISP Relay or Same-Origin APK Mirror for Live Alpine Installs
* **Issue Type**: Story
* **Priority**: Medium
* **Status**: Done
* **Description**: The Alpine initramfs now includes bash, curl, CA certificates, apk, and v86 fetch-relay DHCP. Live `apk update` works through a same-origin APK mirror. Direct guest `curl https://...` still requires an operator-provided WISP/full TCP relay endpoint because fetch relay does not tunnel arbitrary port 443 traffic.
* **Acceptance Criteria**:
  - `linux alpine` can run `apk update` without manual mirror/proxy setup.
  - Alpine boots with IPv4 networking and a default route even when DHCP lease setup is delayed.
  - Guest full-TCP relay can be selected through a documented WISP relay path.
  - Terminal docs explain how to configure or operate the relay in development and production.
* **Verification**:
  - `scripts/build-alpine-initramfs.sh` writes a same-origin mirror under `public/v86/apk/main/x86/`.
  - `vite.config.js` serves `/v86/apk/*` and `/Web-OS/v86/apk/*` as raw octet-stream files with CORS enabled so `.tar.gz` is not browser-decompressed before v86 fetch relay consumes it.
  - `terminal.html` rewrites `/etc/apk/repositories` to the active base-path-aware same-origin mirror and adds the local `<port>.external` host alias after Alpine reaches the shell prompt.
  - Chrome DevTools MCP verified `linux alpine` on `http://127.0.0.1:4173/Web-OS/terminal.html` assigns `192.168.86.100/24`, installs a default route via `192.168.86.1`, and `apk update` returns `OK: 5869 distinct packages available`.
  - `linux alpine wisp://host:port` and `linux alpine wisps://host:port` are accepted as v86 WISP relay configuration routes.

### 🎫 Issue Key: VORTEX-129
* **Summary**: Bundle v86 Worker for GitHub Pages Terminal Deployment
* **Issue Type**: Bug
* **Priority**: High
* **Status**: Done
* **Description**: The deployed GitHub Pages Terminal requested `/Web-OS/v86-worker.js` and crashed the v86 bridge because the worker script was referenced as a plain string and was not emitted into the production `dist` bundle.
* **Acceptance Criteria**:
  - Production build emits a Vite-managed `assets/v86-worker-*.js` worker file.
  - `linux alpine` no longer crashes the worker in a production preview.
  - The Alpine APK mirror URL includes the `/Web-OS/` base path on localhost and GitHub Pages.
  - GitHub Pages HTTPS deployment does not mixed-content-block the v86 fetch relay mirror request.
* **Verification**:
  - `npm run build` emits `dist/assets/v86-worker-*.js`.
  - Chrome DevTools MCP reproduced the old deployed failure as `GET /Web-OS/v86-worker.js [404]` with `[V86LinuxBridge] Worker crashed`.
  - Chrome DevTools MCP verified `http://localhost:4173/Web-OS/terminal.html` boots `linux alpine` to the Alpine shell with no worker crash.
  - Chrome DevTools MCP verified `http://localhost:5178/Web-OS/terminal.html` rewrites `/etc/apk/repositories` to `http://5178.external/Web-OS/v86/apk/main` and `apk update` returns `OK: 5869 distinct packages available`.
  - Chrome DevTools MCP found the first deployed Pages fix still returned `HTTP 502: Bad Gateway` for `apk update`; `v86-worker.js` now exposes `self` as `window` so v86 upgrades relay fetches to HTTPS in the worker.

### 🎫 Issue Key: VORTEX-128
* **Summary**: Document Optional External WISP Relay Without Frontend Runtime Dependency
* **Issue Type**: Story
* **Priority**: Medium
* **Status**: Done
* **Description**: The Vortex terminal can pass WISP relay URLs into v86, but Vortex OS must remain a frontend Web OS and must not require a localhost Node.js relay daemon for its default runtime. WISP is optional external infrastructure for direct guest TCP/HTTPS only; the default browser runtime remains v86 fetch relay plus same-origin APK mirror.
* **Acceptance Criteria**:
  - Default `linux alpine` package workflows work without a localhost Node.js server.
  - `linux alpine wisp://...` and `linux alpine wisps://...` remain optional explicit relay modes.
  - Docs state that WISP hosting is external infrastructure and not part of the frontend-only Web OS runtime.
  - If a WISP endpoint is provided by the operator, Chrome DevTools MCP can verify `curl https://example.com` through that endpoint.
* **Verification**:
  - Created `docs/wisp-relay.md` documenting the two-tier runtime: default (fetch relay + same-origin APK mirror, no server) and optional WISP (external relay for raw TCP).
  - Doc clearly states WISP is external operator infrastructure, not part of Vortex OS frontend runtime.
  - Default `linux alpine` mode confirmed frontend-only via existing v86 fetch relay implementation.

---

### 🎫 Issue Key: VORTEX-130
* **Summary**: Add Browser App With Default Website Suggestions
* **Issue Type**: Story
* **Priority**: Medium
* **Status**: Done
* **Description**: Add a first-party Browser app to Vortex OS with an address/search bar, navigation controls, and default suggested websites including `https://yapweijun1996.com/`, `https://yapweijun1996.github.io/Web-OS/`, and `https://github.com/yapweijun1996`.
* **Acceptance Criteria**:
  - `browser.html` is emitted by the Vite multi-page build.
  - The Browser app is available from the Dock and desktop context menu.
  - Default suggestions include Yap Wei Jun, GitHub Pages, GitHub profile, GitHub, OpenAI, ChatGPT, MDN, npm, and Vercel.
  - Address input accepts full URLs, bare domains, and search terms.
  - Each bookmark can choose Embed or Tab mode, with custom bookmark add/delete support.
  - Sites that block iframe embedding show a clear external-tab panel instead of a blank frame.
  - `docs/browser-app.md` documents Browser app modes, custom bookmarks, and iframe security limits.
* **Verification**:
  - `npm run build` completed successfully and emitted `dist/browser.html`.
  - `task.jsonl` parsed successfully as JSONL.
  - Chrome DevTools MCP verified `browser.html` renders all default website suggestions and starts at `https://yapweijun1996.com/`.
  - Chrome DevTools MCP verified the address bar normalizes `github.com/yapweijun1996` to `https://github.com/yapweijun1996` and search terms to a Google search URL.
  - Chrome DevTools MCP verified the Dock Browser button opens a focused Browser window with `browser.html` and active Dock state.
  - Chrome DevTools MCP verified per-bookmark Embed/Tab mode defaults, persisted mode changes, GitHub iframe-blocked messaging, custom bookmark creation, and custom bookmark deletion.
  - Chrome DevTools MCP verified Yap Wei Jun and GitHub Pages load in iframe Embed mode while GitHub profile remains external-only because GitHub blocks iframe embedding.

---

### 🎫 Issue Key: VORTEX-131
* **Summary**: Redesign Browser App To Follow Chrome-Like UI
* **Issue Type**: Story
* **Priority**: High
* **Status**: Done
* **Epic**: System Apps
* **Description**: The Browser app is functional, but the previous layout behaved more like a website launcher than a Chrome-like browser. The redesign replaces the persistent suggestions grid with a tab strip, compact toolbar, New Tab shortcuts surface, menu/dialog bookmark management, and a content-first viewport. See `docs/browser-chrome-ui-review.md`.
* **Acceptance Criteria**:
  - Add a Chrome-like tab strip above the toolbar with active tab, close tab, and new tab controls.
  - Keep the toolbar compact with Back, Forward, Reload-or-Stop, Home, omnibox, bookmark/star, external-open, and overflow menu controls.
  - Move suggestions and bookmark shortcuts into a New Tab state; after navigation, the content viewport fills at least 70% of desktop height and 65% of mobile height.
  - Move custom bookmark add/edit and Embed/Tab mode controls into a menu, dialog, or side panel instead of repeating them on every card.
  - External-only pages show `Open in Tab`, `Copy URL`, and `Back to New Tab` actions with a concise explanation.
  - Accessibility labels are unique for bookmark mode controls and primary action buttons; keyboard tab order is verified.
* **Verification**:
  - Chrome DevTools MCP audit captured desktop and mobile evidence in `docs/browser-chrome-ui-review.md`.
  - Desktop baseline measured suggestions at about `290px` and content at about `395px` in a `733px` viewport.
  - Mobile baseline measured suggestions at about `658.5px` and content at about `26.5px` in a `733px` viewport.
  - Implemented a Chrome-like tab strip, compact toolbar, New Tab shortcuts surface, Browser menu bookmark creation, bookmark settings dialog, and external-only recovery actions.
  - `npm run build` completed successfully.
  - Chrome DevTools MCP verified desktop loaded-page content viewport at about `89.1%` of viewport height.
  - Chrome DevTools MCP verified mobile loaded-page content viewport at about `90.3%` of viewport height.
  - Chrome DevTools MCP verified New Tab renders `9` shortcuts and GitHub Profile external-only panel exposes Open in Tab, Copy URL, and Back to New Tab.
  - Chrome DevTools MCP verified custom bookmark add, Tab-mode persistence, delete, and mode cleanup through the Browser menu and settings dialog.

---

## 🗂️ Epic: macOS Tahoe 26 Design Alignment

Align the Vortex OS desktop with the latest macOS look and feel — **macOS Tahoe 26**
and its **Liquid Glass** design language. The design source of truth for this epic
is `docs/macos-design-guidelines.md`; every ticket references a section of it.

### 🎫 Issue Key: VORTEX-117
* **Summary**: Adopt the Liquid Glass material system
* **Issue Type**: Story
* **Priority**: High
* **Status**: Done
* **Description**: Replace the flat frosted-blur panels with a reusable Liquid Glass material (translucent tint + `backdrop-filter: blur() saturate()` + faint edge highlight + inner specular highlight + soft drop shadow). Apply it to every floating surface: menu dropdowns, Dock, window chrome, modals, popovers. See `docs/macos-design-guidelines.md` §2.
* **Acceptance Criteria**:
  - A single CSS class/token set defines the Regular Liquid Glass surface and is reused by all floating surfaces.
  - Glass surfaces use saturation (160–200%) plus blur, not blur alone, and carry a 0.5px edge highlight and inner specular highlight.
  - Light and dark tints are both defined.

### 🎫 Issue Key: VORTEX-118
* **Summary**: Make the menu bar fully transparent
* **Issue Type**: Task
* **Priority**: Medium
* **Status**: Done
* **Description**: macOS Tahoe renders the menu bar fully transparent so the wallpaper shows through. Remove the semi-opaque slab background and blur from `#menubar`, keeping only legible glyphs with a subtle text shadow. See §4.
* **Acceptance Criteria**:
  - `#menubar` has no background fill and no backdrop-filter.
  - Menu-bar text stays legible over both bright and dark wallpapers.
  - Menu dropdowns remain Liquid Glass panels.
* **Verification**:
  - `#menubar` `background` set to `transparent`; both `backdrop-filter` lines removed.
  - `--menubar` variable removed from `:root`.
  - `text-shadow: 0 1px 3px rgba(0,0,0,0.65)` added to `.menu-item` for legibility over any wallpaper.

### 🎫 Issue Key: VORTEX-119
* **Summary**: Introduce concentric corner-radius tokens
* **Issue Type**: Task
* **Priority**: Medium
* **Status**: Done
* **Description**: Define a radius token scale (`--r-window`, `--r-panel`, `--r-dock`, `--r-control`, `--r-capsule`) and apply it so nested rounded rectangles are concentric (child radius = parent radius − gap). See §3.
* **Acceptance Criteria**:
  - All hardcoded `border-radius` values are replaced by radius tokens.
  - Nested elements (panel → row, window → toolbar button) are visibly concentric.
* **Verification**:
  - Added `--r-window: 12px`, `--r-panel: 11px`, `--r-dock: 22px`, `--r-control: 8px`, `--r-capsule: 999px` to `:root`.
  - Replaced 10 hardcoded `border-radius` values with the matching tokens across `.menu-dropdown`, `.context-panel`, `.desktop-icon`, `#dock`, `.window`, modals, inputs, `.settings-warning`, `.wallpaper-swatch`, `.vx-toast`.
  - `.window.maximized { border-radius: 0 }` override preserved as literal 0.
  - `.btn` now consumes `--r-capsule` (see VORTEX-120).

### 🎫 Issue Key: VORTEX-120
* **Summary**: Convert controls to capsule shapes
* **Issue Type**: Story
* **Priority**: Medium
* **Status**: Done
* **Description**: Push buttons, segmented controls, and toggles use full-capsule radii in Tahoe; text fields use the small control radius. Restyle `.btn` and related controls, add a consistent accent focus ring, and ensure ≥28px hit targets. See §7.
* **Acceptance Criteria**:
  - Buttons and segmented controls render as capsules; text fields use `--r-control`.
  - Every focusable control shows an accent focus ring on keyboard focus.
  - All interactive controls are at least 28px tall.
* **Verification**:
  - `.btn` `border-radius: 7px` → `var(--r-capsule)` (999px); padding changed to `7px 14px` (≥28px height).
  - Added `.btn:focus-visible { box-shadow: 0 0 0 3px rgba(10,132,255,0.35) }` focus ring.
  - Chrome DevTools computed: `.btn` `borderRadius: 999px`; Settings modal Cancel/Save render as full pills.

### 🎫 Issue Key: VORTEX-121
* **Summary**: Unify the window toolbar with the window body
* **Issue Type**: Task
* **Priority**: Medium
* **Status**: Done
* **Description**: Tahoe toolbars share the window background instead of a distinct titlebar color. Remove the separate `--titlebar` fill so the window header and body read as one surface; give toolbar buttons only a slight drop shadow for affordance. See §6.
* **Acceptance Criteria**:
  - The window header no longer uses a distinct background color from the window body.
  - Toolbar/header buttons remain discoverable via a subtle shadow, not a filled bar.
  - Focused vs. unfocused window states are still visually distinct.
* **Verification**:
  - `.window-header` `background` changed from `var(--titlebar)` to `var(--window-bg)`.
  - `border-bottom: 1px solid rgba(0,0,0,0.35)` removed from `.window-header`.
  - `--titlebar` variable removed from `:root`.
  - `:not(.focused)` traffic-light and title-dim rules remain untouched.

### 🎫 Issue Key: VORTEX-122
* **Summary**: Build a real Liquid Glass Control Center panel
* **Issue Type**: Story
* **Priority**: Medium
* **Status**: Done
* **Description**: The menu-bar Control Center glyph currently opens nothing. Build a Liquid Glass panel with a grid of rounded tiles (e.g. wallpaper, accent color, a couple of toggles) so the control is functional, not decorative. See §8.
* **Acceptance Criteria**:
  - Clicking the Control Center glyph opens a Liquid Glass panel.
  - The panel contains at least three working tiles.
  - The panel closes on outside click / Escape.
* **Verification**:
  - Added `#control-center` fixed-position Liquid Glass panel (`--lg-tint/blur/edge/shadow`) in `index.html`.
  - Three working tiles: Wallpaper (opens Settings modal), Accent (cycles 6 preset colors via `--accent` CSS variable), Appearance (toggles `body.light-mode` + restores/clears inline wallpaper style).
  - Added `id="cc-menu-btn"` with `aria-expanded` toggling to Control Center glyph.
  - Panel closes on outside click and Escape key; wired in existing document click/keydown handlers.
  - Accent and light-mode selections persisted to `localStorage`; restored on startup.
  - Chrome DevTools confirmed: CC opens, accent cycles Blue→Purple→Pink, light mode changes wallpaper to light gradient, outside click closes.

### 🎫 Issue Key: VORTEX-123
* **Summary**: Replace emoji app icons with squircle layered icons
* **Issue Type**: Story
* **Priority**: Low
* **Status**: Done
* **Description**: Desktop and Dock apps currently use raw emoji. Render them as macOS-style squircle (rounded-square) icon tiles with a layered background and glyph, consistent with Tahoe's icon treatment. See §5 and §9.
* **Acceptance Criteria**:
  - Dock and desktop icons render as squircle tiles, not bare emoji.
  - Icon tiles share a consistent size, radius, and background treatment.
* **Verification**:
  - `.squircle` CSS class added: 44×44px, `border-radius: 12px`, per-app gradient background.
  - `.desktop-icon .squircle` override: 54×54px, `border-radius: 14px`, `margin-bottom: 6px`.
  - 10 per-app gradient classes: `icon-dashboard`, `icon-files`, `icon-browser`, `icon-terminal`, `icon-storage`, `icon-security`, `icon-notes`, `icon-monitor`, `icon-plugin`, `icon-add`.
  - Dock buttons (5) and desktop icons (3 static + dynamic plugin via `renderInstalledApps()`) all use squircle spans.
  - Chrome DevTools screenshot confirmed: colored squircle tiles visible in Dock and desktop grid.

### 🎫 Issue Key: VORTEX-124
* **Summary**: Honor accessibility preferences for glass and motion
* **Issue Type**: Story
* **Priority**: High
* **Status**: Done
* **Description**: Liquid Glass must degrade gracefully. Add media-query support for `prefers-reduced-transparency` (opaque surfaces), `prefers-contrast` (stronger borders/text), and `prefers-reduced-motion` (drop non-essential animation). Make the accent color user-selectable via the `--accent` variable. See §9 and §12.
* **Acceptance Criteria**:
  - With reduced transparency, every glass surface becomes fully opaque.
  - With reduced motion, non-essential transforms/animations are removed.
  - The system accent color is user-selectable and applied through `--accent`.
* **Verification**:
  - `@media (prefers-reduced-transparency: reduce)`: all glass surfaces (`.lg-surface`, `.menu-dropdown`, `.context-panel`, `#dock`, modals, `#control-center`) set `backdrop-filter: none; background: #2c2c2e`; menubar gets opaque fallback.
  - `@media (prefers-reduced-motion: reduce)`: dock hover transform, desktop-icon active scale, wallpaper swatch hover, vx-toast animation all removed.
  - `@media (prefers-contrast: more)`: window and panel borders strengthened to `rgba(255,255,255,0.35–0.45)`; menu text set to `#fff`; menubar gets dark opaque background for contrast.
  - Accent color user-selectable via Control Center Accent tile (VORTEX-122); applied through `--accent` CSS variable on `:root`.
