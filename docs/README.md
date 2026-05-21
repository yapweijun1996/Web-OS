# Vortex OS Documentation

Design specifications and developer guides for [Vortex OS](../README.md), a vanilla
web operating system. Each document is a self-contained spec for one subsystem.

For the high-level architecture overview, start with [`../DESIGN.md`](../DESIGN.md).

## Plugins & IPC

- [Plugin System Developer Guide](plugin-system.md) — building manifest-based, sandboxed `<iframe>` plugins.
- [Gateway Proxy Routing](gateway-proxy-routing.md) — host-side reverse proxy for installing CORS-protected third-party plugins.
- [IPC Telemetry Integration](ipc-telemetry-integration.md) — binding `PluginHarness` IPC messages to `WindowManager` window nodes.

## Storage & Virtual File System

- [Storage Engine](storage-engine.md) — the VFS and gzip-compressed append-only JSONL storage engine.
- [Instance Detection](instance-detection.md) — same-tab and cross-tab `CompressedStorageEngine` instance detection.
- [IndexedDB Lock Protection](indexeddb-lock-protection.md) — `onversionchange` lifecycle handling and cross-tab lock contracts.

## Agents & Memory

- [Multi-Agent Orchestration](multi-agent-orchestration.md) — the background `OrchestratorAgent` and tool-use contracts.
- [KB-MCP Integration](kb-mcp-integration.md) — persistent cross-session memory via the KB-MCP server.

## Cross-Tab Coordination

- [BroadcastChannel Handshake](broadcastchannel-handshake.md) — PING-PONG handshake spec for coordinating multiple browser tabs.

## Terminal & Wasm Linux

- [Terminal Runtime](terminal-runtime.md) — xterm.js wiring and the cross-origin isolation headers it requires.
- [Alpine Cold Start](alpine-cold-start.md) — shrinking the Wasm Alpine Linux kernel and initramfs for faster boot.

## Desktop UI

- [Custom Context Menu](custom-context-menu.md) — the desktop-grade right-click context menu.
- [Control Panel & Settings](control-panel-settings.md) — the Settings panel and API-key / gateway management.
- [Resource Monitor](resource-monitor.md) — the real-time process-manager app.
- [Browser App](browser-app.md) — default website suggestions, Embed/Tab modes, custom bookmarks, and iframe security limits.

## Reviews

- [Chrome DevTools Review — 2026-05-20](chrome-devtools-review-2026-05-20.md) — live dev-server audit via the Chrome DevTools MCP server.
