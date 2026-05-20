# Vortex OS - Resource Monitor (Process Manager) Design Specification

This document outlines the architectural design, polling mechanisms, and browser-native API integrations required to build a real-time **Resource Monitor (Process Manager)** for Vortex OS to track sandboxed iframe performance and main-thread health.

---

## 1. Architectural Role of the Resource Monitor

In a native, single-tab Web OS, there is no physical kernel to enforce hardware scheduler limits. Instead, the Resource Monitor acts as an **Active Introspection Subsystem** (AIS) that:
1. **Discovers Processes**: Dynamically queries the `WindowManager` to list active iframe nodes and plugin instances.
2. **Polls Performance Telemetry**: Collects memory, DOM complexity, and event loop latency metrics.
3. **Enforces Lifecycle Control**: Offers a safe, immediate "End Process" (SIGKILL simulation) that unmounts iframe containers and unregisters MessageChannel listeners to reclaim browser memory.

---

## 2. Dynamic Performance Polling Framework

To monitor isolated sandboxed iframes without breaking the browser's security boundaries, Vortex OS combines three non-intrusive polling metrics:

### A. Main-Thread Event Loop Latency (CPU Responsiveness)
Because JavaScript is single-threaded, a heavy calculation inside any same-origin script or host-managed plugin will instantly block the main thread, causing frame drops.
- **The Mechanism**: The monitor runs a lightweight `requestAnimationFrame` loop. It measures the delta between the expected frame time (e.g., 16.67ms for 60Hz) and the actual time elapsed.
- **Latency Spike Alert**: If the delta exceeds a specified threshold (e.g., >50ms), the system flags the active focused window as "Unresponsive" and warns the user.

### B. DOM Tree Complexity Polling (Rendering Footprint)
A heavy DOM tree directly slows down CSS styling re-calculations, layout reflows, and compositing passes.
- **The Mechanism**: For same-origin system applications (such as Files or Terminal), the host performs a recursive child node count of the window's iframe body container.
- **Limit Enforcement**: Windows with node counts exceeding a set warning threshold (e.g., >10,000 nodes) are marked as "Heavy" in the task manager.

### C. IPC Message Volume Rate (Communication Overhead)
If a sandboxed plugin has a loop bug, it can flood the MessageChannel with rapid API requests (such as continuous file writes), causing CPU spikes.
- **The Mechanism**: In `host-core.js`, every incoming `onmessage` event increment a message-counter associated with that specific `PluginHarness` instance. The Resource Monitor polls these counters once per second and resets them.
- **Flood Protection**: If an app's IPC rate exceeds an absolute ceiling (e.g., >200 messages/sec), the kernel automatically throttles or suspends its port communication channel.

---

## 3. Advanced Memory Profiling (Blink-Native APIs)

Modern Chromium-based browsers provide APIs specifically designed to measure isolated page memory safely:

1. **`performance.measureUserAgentSpecificMemory()`**:
   - *Security Requirement*: Requires Cross-Origin-Opener-Policy (COOP) and Cross-Origin-Embedder-Policy (COEP) headers to isolate the tab process.
   - *Output*: Provides the exact JS heap bytes utilized by each active iframe origin, allowing true per-plugin RAM allocation reports.
2. **`window.performance.memory` (Fallback)**:
   - *Output*: Reports overall JS heap metrics (used, total, and limit) of the entire browser tab, serving as a general telemetry signal for heap exhaustion.

---

## 4. UI Layout & User Experience (UX)

The Resource Monitor presents as a native system utility window with three key panels:

- **System Diagnostics Summary**:
  - Live clock, current UI frame rate (FPS), and total tab JS heap memory allocation.
- **Active Process Table**:
  - Column 1: **App Name & Icon** (e.g. 💻 Terminal, 🧩 AI Data Analyzer).
  - Column 2: **Process Status** (Active / Focused / Minimized / Suspended / Unresponsive).
  - Column 3: **DOM Elements** (Count of nested tags in the window body).
  - Column 4: **IPC Rate** (Messages per second).
  - Column 5: **Kill Switch** (A red "End Process" button).
- **CPU Latency Sparkline**:
  - A real-time, hardware-accelerated 2D canvas chart mapping event loop latency over the last 30 seconds.
