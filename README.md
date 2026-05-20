# Vortex OS - A "Vanilla" Frontend Web Operating System

Vortex OS is an ultra-lightweight, high-performance web desktop environment built entirely with native HTML5, CSS3, and JavaScript—completely free of heavy frontend frameworks like React or Vue. It serves as a visual hub for persistent client-side data management, sandboxed plugin execution, and browser-embedded WebAssembly Linux virtualization.

---

## 🚀 Key Features

1. **Vanilla Core**: Direct DOM manipulation without Virtual DOM reconciliation overhead, yielding sub-millisecond rendering updates and zero bundle bloat.
2. **IPC Sandboxed Plugins**: A manifest-based plugin architecture. Plugins run within strictly sandboxed `<iframe>` elements and communicate with the host OS safely using `MessageChannel` capability tokens.
3. **Compressed Streaming Storage**: A log-structured Virtual File System (VFS) utilizing IndexedDB, with append-only logs compressed dynamically in the browser via the native Web Compression Streams API (`gzip`).
4. **Wasm Linux Terminal**: Multithreaded integration of a WebAssembly-based Alpine Linux kernel running on a Web Worker, routing stdin/stdout pipelines straight to the window interface.

---

## 📂 Project Structure

```text
├── .github/workflows/deploy.yml  # GitHub Pages CI/CD workflow
├── public/v86/                   # v86 WebAssembly emulator assets
├── docs/                         # Subsystem design specs — see docs/README.md
├── index.html                    # OS desktop: window manager, menu bar, dock
├── window-manager.js             # Window Management System (WMS)
├── host-core.js                  # Plugin harness & capability-token IPC validator
├── capability.js                 # Capability-token model (allow-list, grammar, checks)
├── contracts.js                  # Shared string vocabularies (events, channels)
├── plugin-installer.js           # Reverse proxy for installing CORS-protected plugins
├── plugin.js                     # Example sandboxed plugin
├── manifest.json                 # Example plugin manifest
├── agent-core.js                 # Event-hook interceptors & multi-agent orchestrator
├── kb-proxy.js                   # Host-side proxy to the KB-MCP knowledge server
├── jsonl-storage-engine.js       # Gzipped append-only IndexedDB storage engine
├── v86-bridge.js                 # WebAssembly Linux serial stdio bridge
├── v86-worker.js                 # Web Worker hosting the v86 virtual machine
├── calculator.html               # Built-in app: Calculator
├── dashboard.html                # Built-in app: Dashboard
├── files.html                    # Built-in app: Files
├── monitor.html                  # Built-in app: Activity Monitor
├── notes.html                    # Built-in app: Notes (auto-saving)
├── terminal.html                 # Built-in app: Terminal
├── test.html                     # Automated browser test runner for the VFS
├── vite.config.js                # Vite dev server / build config
├── package.json                  # npm + Vite configuration
├── favicon.svg                   # App icon
├── DESIGN.md                     # Architecture deep-dive
├── AGENTS.md                     # Contribution rules for AI agents
└── README.md                     # Getting Started guide (this file)
```

---

## 📖 Documentation

- [`DESIGN.md`](DESIGN.md) — in-depth architectural breakdown of Vortex OS.
- [`docs/`](docs/README.md) — per-subsystem design specifications and developer
  guides (plugins, storage, agents, terminal, desktop UI). The
  [docs index](docs/README.md) lists all of them by topic.

---

## 🛠️ Getting Started

### Prerequisites

You need [Node.js](https://nodejs.org/) (v18 or higher) installed on your machine.

### Local Development

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd Web-OS
   ```

2. **Install Vite development dependencies**:
   ```bash
   npm install
   ```

3. **Start the local dev server**:
   ```bash
   npm run dev
   ```

4. **Access the OS**:
   Open the browser to `http://localhost:5173` (or the port specified in your console).

---

## 🧪 Testing

Open the browser to the local URL under the `test.html` route (e.g., `http://localhost:5173/test.html`). This executes a comprehensive set of non-destructive transactional tests on the `CompressedStorageEngine` directly in the browser's JavaScript engine.

---

## 🚢 Continuous Integration & Deployment

This project is pre-configured to build and deploy to **GitHub Pages** automatically upon any push to the `main` branch.

- Configuration is managed in `.github/workflows/deploy.yml`.
- Ensures zero deployment friction—simply commit and push:
  ```bash
  git add .
  git commit -m "feat: bootstrap documentation and setup"
  git push origin main
  ```
- Your live site will automatically compile and deploy on GitHub Actions!
