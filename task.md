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
* **Status**: To Do
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
* **Status**: To Do
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
* **Status**: To Do
* **Description**: Introduce a configurable CORS bypass proxy helper in `index.html` to allow downloading plugin manifests from remote non-CORS enabled servers.
* **Acceptance Criteria**:
  - Dynamic App installation successfully fetches manifests from third-party domains (e.g. raw.githubusercontent.com) without triggering CORS block.
  - The proxy path is configurable from the settings panel.
  - Robust sanitization applies to proxy response before parsing.
