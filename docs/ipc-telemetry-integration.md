# Vortex OS - IPC Telemetry Integration Design Specification

This document describes how Vortex OS binds the asynchronous IPC messages handled by the `PluginHarness` inside `host-core.js` to the window nodes managed by `WindowManager`, making real-time IPC rate telemetry functional for the Resource Monitor.

---

## 1. The Challenge of Cross-Subsystem Telemetry

In Vortex OS:
- **`WindowManager` (window-manager.js)** manages window elements (DOM elements with the `.window` class) and implements `getProcessTelemetry()`. It knows about `win` references but doesn't know about message communications.
- **`PluginHarness` (host-core.js)** manages the sandboxed iframe and the `MessageChannel` port listening to IPC requests. It knows about messaging but has no direct reference to the window element container.

To bridge this gap without creating heavy cross-dependencies, we can leverage the DOM tree structure since the plugin harness is mounted directly inside the window's body.

---

## 2. The Binding Strategy: Closest DOM Node Lookup

Because `PluginHarness.mount(containerElement)` is passed the `.window-body` DOM node, the harness can look up its parent `.window` container safely using the standard DOM `closest()` selector.

```
       +---------------------------------------------+
       |             WindowManager                   |
       |  - Instantiates ".window"                   |
       |  - Instantiates ".window-body" (body)       |
       |  - Calls fillBody(body)                     |
       +----------------------┬----------------------+
                              |
                              v
       +---------------------------------------------+
       |             PluginHarness                   |
       |  - Receives "body" container                |
       |  - Locates win = body.closest('.window')    |
       |  - Binds win._ipcCount = 0                  |
       +----------------------┬----------------------+
                              |
                              v
       +---------------------------------------------+
       |         MessageChannel Port Receiver        |
       |  - Receives IPC message                     |
       |  - Increments win._ipcCount++               |
       +---------------------------------------------+
```

---

## 3. Step-by-Step Execution Flow

1. **Initialization (`mount` phase)**:
   - When mounting the plugin, `PluginHarness` grabs a reference to the closest `.window` element:
     ```javascript
     this.windowElement = containerElement.closest('.window');
     if (this.windowElement) {
       this.windowElement._ipcCount = 0;
     }
     ```
2. **Incrementation (`message` phase)**:
   - On every message processed by `handleIpcRequest(event)`, the harness increments the counter:
     ```javascript
     if (this.windowElement) {
       this.windowElement._ipcCount++;
     }
     ```
3. **Observation (`telemetry` phase)**:
   - When the Resource Monitor app calls `window.vortexKernel.getProcessTelemetry()`, `WindowManager` reads `win._ipcCount || 0` and resets or returns it, providing zero-overhead, real-time communication throughput tracking.
4. **Cleanup (`destroy` phase)**:
   - When the window is closed, `harness.destroy()` is called, tearing down the iframe, closing the ports, and safely allowing garbage collection of the DOM node and its attached primitive counter.
