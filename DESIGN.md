# Vortex OS Architecture & System Design Document

This document provides a comprehensive technical breakdown of the architecture, security isolation, window management subsystems, and persistent storage abstractions of **Vortex OS**.

---

## 1. System Architecture Overview

Vortex OS is modeled around a web-native **Microkernel Architecture**. Rather than managing physical hardware, the "kernel" acts as an orchestrator, managing:
1. **Application Lifecycle**: Loading, mounting, and killing app sandboxes.
2. **IPC (Inter-Process Communication)**: Validating capability tokens across MessageChannels.
3. **Hardware-Accelerated UI Presentation**: A centralized Window Management System (WMS).
4. **VFS (Virtual File System)**: Translating abstract UNIX paths to compressed client-side storage objects.

```
       +-------------------------------------------------+
       |             Vortex Desktop GUI                  |
       |  +--------------------+  +-------------------+  |
       |  | Storage Test App   |  | Terminal App      |  |
       |  +--------------------+  +-------------------+  |
       +-------------------------------------------------+
                                |
       +-------------------------------------------------+
       |              Vortex OS Core (Kernel)            |
       |  +-------------------------------------------+  |
       |  |        Window Management System (WMS)     |  |
       |  +-------------------------------------------+  |
       |  |        Capability Tokens Security Guard   |  |
       |  +-------------------------------------------+  |
       +-------------------------------------------------+
            |                                       |
            v                                       v
+------------------------+             +------------------------+
|   IndexedDB VFS Layer  |             |  Wasm Linux Worker VM  |
|  (gzip Compression)    |             |  (Alpine Linux Kernel) |
+------------------------+             +------------------------+
```

---

## 2. Process Isolation & Security Sandboxing

Executing third-party applications in a pure frontend environment poses severe security challenges, especially regarding cross-site scripting (XSS) and unauthorized access to API keys.

### The Sandbox Boundary

Vortex OS isolates every application using a strict double-isolation pattern:
- **HTML5 iframe Sandboxing**: Apps are placed inside `<iframe>` elements configured with `sandbox="allow-scripts"`. By omitting `allow-same-origin`, the application runs in a completely separate origin, physically blocking it from accessing the host's `localStorage`, `IndexedDB`, or top-level `window` variables.
- **Capability-Token Security Guard**: The iframe is completely cut off from network or storage. To read or write, it must request permissions from the Host. The Host only grants operations that match the tokens declared in the app’s `manifest.json`.

---

## 3. Window Management Subsystem (WMS)

The WMS delivers a 60FPS high-fidelity desktop experience by decoupling DOM layout calculations from user interaction threads.

### Layering (Z-Index Tracker)
- The WMS maintains an array of active window DOM node references.
- Clicking a window pushes its reference to the top of the array, triggering a batch reassignment of `z-index` properties to all active windows.

### Dragging & Resizing Optimization
- Traditional updates to CSS properties like `style.left` and `style.top` trigger **browser layout reflows**, stalling the browser's rendering pipeline.
- **The Optimization**: Vortex OS utilizes CSS `transform: translate3d(x, y, 0)` during dragging operations. By modifying only transform properties, layout reflow is completely bypassed; instead, the browser's compositor thread orchestrates GPU-accelerated repositioning directly.

---

## 4. Virtual File System (VFS) with Streaming Compression

Standard JSON databases require reading, modifying, and stringifying the entire database object for any update, leading to performance bottlenecks as the file size grows.

### Append-Only Log-Structured Storage
Vortex OS implements a highly optimized log-structured VFS using a combination of:
1. **JSONL (JSON Lines)**: Each file entry or state update is written as a self-contained single-line JSON string followed by `\n`.
2. **Independent Gzip Chunks**: Each appended batch is compressed into its own self-contained gzip member. The browser's native `DecompressionStream('gzip')` does **not** decode physically concatenated gzip members, so a file is stored as a *list* of independent chunks rather than one merged buffer — each chunk is decoded individually on read.
3. **Compression Streams API**: By using `CompressionStream('gzip')`, raw JSONL string lines are compressed on-the-fly inside a memory buffer and appended as a new chunk to the file's chunk list in IndexedDB. This minimizes both the disk write footprint and garbage collection pauses without re-compressing existing data.

---

## 5. WebAssembly Linux Kernel Bridge

To support real Linux utilities, terminal environments, and compilers, Vortex OS integrates a WebAssembly port of an x86 Emulator (such as v86 or TinyEMU).

### Threading Model
- The Wasm Virtual Machine compiles and runs inside a **Web Worker**.
- This isolates CPU-intensive instruction sets (e.g., executing binary compilers, shell loops) from the browser's UI render loop, preserving input responsiveness.

### Virtual IO Pipeline
- **Stdin Pipeline**: Keystrokes inside a sandboxed terminal app are converted to UTF-8 buffers and routed through `MessagePort` -> `V86LinuxBridge` -> Worker -> `v86.serial0_send()`.
- **Stdout Pipeline**: Serial outputs generated by the virtual OS are caught by the Worker, dispatched back to the Bridge, and pushed through the terminal's registered port to trigger real-time canvas updates.

---

## 6. Performance Introspection & Resource Monitoring

To track process performance, RAM footprint, and main-thread health, Vortex OS implements an **Active Introspection Subsystem** (AIS) described in `docs/resource-monitor.md`.
- **Event Loop Latency**: Monitored via a high-cadence `requestAnimationFrame` loop that flags lag spikes above 50ms.
- **DOM Node Polling**: Measures structural complexity by counting recursive nested tags inside container elements.
- **IPC Frequency Throttling**: Monitors the message transfer rate over MessageChannel ports, preventing infinity-loop bugs from flooding the main UI thread.

---

## 7. Standard System Applications

Vortex OS includes built-in web-native applications designed to emulate a standard desktop experience:
- **Calculator (`calculator.html`)**: A responsive, 100% vanilla mathematical utility mimicking macOS look-and-feel. Features full keypress event mapping, state persistence, floating-point rounding corrections, and continuous operator support.
- **Notes (`notes.html`)**: A real-time, auto-saving text editor. By utilizing `storageEngine.queueLine()`, typing inputs are debounced by 500ms before triggering IndexedDB transactions, significantly reducing main-thread CPU and disk overhead.
- **Terminal (`terminal.html`)**: Translates serial VM outputs into a terminal console frame using standard input/output pipelines.
