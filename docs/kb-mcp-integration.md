# Vortex OS KB-MCP Memory Integration Guide

This document describes how Vortex OS integrates with the centralized **Knowledge Base Model Context Protocol (KB-MCP)** server to provide persistent, cross-device long-term memory for browser-embedded AI Agents.

---

## 1. Architectural Overview

The AI Agent Runtime inside Vortex OS runs inside a dedicated background process (Web Worker). While local configurations are stored in IndexedDB, local storage is volatile (subject to browser cache clearing) and isolated to a single device. 

By integrating with a centralized KB-MCP server (e.g., `https://kb.yapweijun1996.com`), the embedded AI Agent gains access to a robust, persistent, and synchronized long-term memory network.

```
┌────────────────────────────────────────────────────────┐
│                      Vortex OS                         │
│                                                        │
│  ┌──────────────────────┐      ┌────────────────────┐  │
│  │ Sandboxed Agent App  │      │ Background Worker  │  │
│  │ (UI Console View)    │      │ (Agent Core)       │  │
│  └──────────┬───────────┘      └─────────┬──────────┘  │
│             │                            │             │
│             └─────────────┬──────────────┘             │
│                           │ (MessageChannel IPC)       │
│                           v                             │
│               ┌───────────────────────┐                │
│               │  Host Security Guard  │                │
│               └───────────┬───────────┘                │
└───────────────────────────┼────────────────────────────┘
                            │ (CORS Authorized Fetch)
                            v
                ┌───────────────────────┐
                │     KB-MCP Server     │
                │ (Vector Database &    │
                │ Memory Consolidation) │
                └───────────────────────┘
```

---

## 2. Dynamic Memory Categories

Vortex OS maps the agent's experiences into four distinct memory buckets defined by the KB-MCP protocol:

1. **Semantic Memory (Fact-based)**:
   - Stable facts, user preferences, configuration files, and system-level guidelines.
   - *Example*: User's favorite editor theme, system-level API tokens.
2. **Episodic Memory (Event-based)**:
   - Historical events the agent lived through, conversation transcripts, and task outcomes.
   - *Example*: "On 2026-05-20, successfully compiled Alpine Linux kernel inside v86."
3. **Procedural Memory (Skill-based)**:
   - Reusable scripts, system command runs, prompt templates, and execution workflows.
   - *Example*: Shell commands to update VFS indexes, custom Python scripts.
4. **Reflective Memory (Insight-based)**:
   - High-level insights and lessons learned synthesized by the Agent over time.
   - *Example*: "Using LZMA compression is 30% faster than standard Gzip for log aggregation."

---

## 3. Communication Protocols & Security Guard

To interact with the KB-MCP endpoints, the AI Agent must communicate through the Host OS kernel using authorized **Capability Tokens**.

### Manifest Privilege Declaration

Any application or background script requiring KB-MCP access must declare it in `manifest.json`:

```json
{
  "id": "com.vortex.agent.core",
  "name": "Vortex AI Agent Core",
  "permissions": [
    "kb-mcp:read",
    "kb-mcp:write"
  ]
}
```

### IPC Bridge Call (Host Side Verification)

The host validates the permission token before forwarding the HTTP fetch request to the centralized KB-MCP endpoints:

```javascript
// host-core.js extension concept (English Coding Only)
async function handleKbMcpRequest(port, action, payload, token) {
  if (!manifest.permissions.includes(token)) {
    port.postMessage({ error: "Access Denied: Missing KB-MCP tokens." });
    return;
  }

  const endpoint = `https://kb.yapweijun1996.com/api/v1/kb/${payload.kb_id}/items`;
  
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SYSTEM_API_KEY}`
      },
      body: JSON.stringify(payload.item)
    });
    const result = await response.json();
    port.postMessage({ success: true, data: result });
  } catch (err) {
    port.postMessage({ error: err.message });
  }
}
```

---

## 4. Automatic Synchronization of Project Documentation

To ensure the AI Agent always has access to the latest project specifications without manually reading raw files, Vortex OS runs an **automatic document synchronization process**:

- **Path Crawler**: Periodically scans `DESIGN.md`, `README.md`, and all files under `docs/**/*.md`.
- **Markdown Parser**: Splits documents into distinct sections based on H2 (`##`) headers to fit within standard vector model context windows.
- **KB Sync Job**: Calls `kb_kb_add_item` (or `kb_kb_update_item` if unchanged) to publish section contents to the `vortex-web-os-project-docs` knowledge base, tagging them with the correct source path.
