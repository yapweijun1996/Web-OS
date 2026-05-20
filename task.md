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
