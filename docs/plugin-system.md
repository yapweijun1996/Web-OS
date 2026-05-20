# Vortex OS Plugin System Developer Guide

Vortex OS provides a secure, manifest-based plugin architecture designed to allow developers to build, distribute, and execute custom web-based desktop applications safely in the browser.

---

## 1. The Plugin Package Structure

A valid plugin consists of three primary components:
1. `manifest.json`: Configuration defining permissions and entrypoint.
2. `plugin.js` (or index.html): Application runtime logic.
3. Assets (styles, images, markup).

---

## 2. Plugin Manifest Specification

The `manifest.json` file is a required metadata file declaring the capabilities and permissions the plugin requires from the host OS.

```json
{
  "id": "com.vortex.app.example",
  "name": "My Vanilla App",
  "version": "1.0.0",
  "description": "An example app that performs data analysis and sends alerts.",
  "entrypoint": "plugin.js",
  "permissions": [
    "fs:read:/documents",
    "fs:write:/reports",
    "system:notify"
  ],
  "sandbox": {
    "allowScripts": true,
    "allowDownloads": false,
    "allowSameOrigin": false
  }
}
```

### Permission Capability Tokens Explained

- `fs:read:<path>`: Grants access to read contents from the specified virtual directory.
- `fs:write:<path>`: Grants permission to write/append records to the specified virtual directory.
- `system:notify`: Grants the privilege to invoke browser notifications or system alerts.
- `agent:orchestrate`: Allows calling system-orchestrated AI Agents to assist in automation.
- `kb-mcp:read`: Grants read/search access to the KB-MCP knowledge server via the host proxy.
- `kb-mcp:write`: Grants write access to store vector items in the KB-MCP knowledge server.

---

## 3. Secure Channel Communication (IPC Pattern)

Because the plugin is sandboxed inside an iframe without direct access to the parent window or browser APIs, all system interactions must be mediated via a secure `MessageChannel`.

### Handshake Sequence

1. The Host loads the iframe and waits for the `load` event.
2. The Host creates a `MessageChannel` and sends the second communication port (`MessagePort`) to the iframe via `postMessage`.
3. The plugin captures this port and binds it to its local lifecycle.

### Sending an API Request

To perform any action, the plugin must post a message structured with an authorized **Capability Token**:

```javascript
// Example: Requesting a file write operation
function saveLogEntry(jsonData) {
  if (!hostPort) {
    console.error("IPC port not initialized");
    return;
  }

  hostPort.postMessage({
    action: "fs:write",
    token: "fs:write:/reports", // Must exactly match permission in manifest
    payload: {
      path: "/reports/summary.jsonl",
      data: JSON.stringify(jsonData) + "\n"
    }
  });
}
```

---

## 4. Best Practices for Plugin Developers

1. **Avoid Global Styles**: Always scope your CSS rules within a container selector (or utilize Shadow DOM) to avoid styling leaks in case same-origin sandbox conditions are relaxed.
2. **Handle Interruption Gracefully**: Clean up timers, abort active fetch requests, and close any local IndexedDB cursors when the application is requested to close.
3. **Minimize PostMessage Size**: Avoid passing large binary blobs or circular JSON objects over the `postMessage` channel. Use stream chunking where possible.
