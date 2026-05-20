// v86-bridge.js (English Coding Only)
//
// VORTEX-101: Host-side bridge between sandboxed terminal windows and the
// v86 WebAssembly Linux VM running inside a dedicated Web Worker. It owns the
// worker lifecycle and routes the stdin/stdout serial pipelines.

class V86LinuxBridge {
  constructor(config = {}) {
    this.workerScript = config.workerScript || 'v86-worker.js';

    // Runtime resources handed to the worker. These binaries are not bundled
    // in the repository - override the URLs to point at real v86 assets.
    this.resources = {
      libUrl: config.libUrl || 'libv86.js',
      wasmPath: config.wasmPath || 'v86.wasm',
      biosUrl: config.biosUrl || 'seabios.bin',
      vgaBiosUrl: config.vgaBiosUrl || 'vgabios.bin',
      imageUrl: config.imageUrl || 'alpine.img'
    };

    this.worker = null;
    this.status = 'idle'; // idle | booting | running | ready | error
    this.onStatusChange = config.onStatusChange || null;
    this.subscribers = new Map(); // Maps port ID to active MessagePorts
  }

  // Spawns the dedicated Web Worker running the v86 emulator.
  init() {
    this.worker = new Worker(this.workerScript);
    this._setStatus('booting');

    // Bootstrap the v86 engine inside the worker.
    this.worker.postMessage({
      action: 'BOOT_EMULATOR',
      payload: this.resources
    });

    // Handle incoming messages (stdout + lifecycle) from the emulator worker.
    this.worker.onmessage = (event) => {
      const { type, data } = event.data || {};
      switch (type) {
        case 'SERIAL_OUT':
          this.broadcastToTerminals(data);
          break;
        case 'BOOT_STARTED':
          this._setStatus('running');
          break;
        case 'BOOT_READY':
          this._setStatus('ready');
          break;
        case 'BOOT_ERROR':
          this._setStatus('error');
          console.error('[V86LinuxBridge] Linux VM boot failed:', data);
          this.broadcastToTerminals(`\r\n[Vortex OS] Linux VM unavailable: ${data}\r\n`);
          break;
      }
    };

    this.worker.onerror = (err) => {
      this._setStatus('error');
      console.error('[V86LinuxBridge] Worker crashed:', err.message);
    };
  }

  _setStatus(status) {
    this.status = status;
    if (typeof this.onStatusChange === 'function') {
      this.onStatusChange(status);
    }
  }

  // Connects a sandboxed terminal plugin's MessagePort to the Linux instance.
  registerTerminalPort(portId, port) {
    this.subscribers.set(portId, port);

    // Listen for inputs (stdin) from the terminal plugin.
    port.onmessage = (event) => {
      const { action, data } = event.data;
      if (action === 'STDIN' && this.worker) {
        // Send keyboard input directly to the v86 emulator serial port.
        this.worker.postMessage({
          action: 'SERIAL_IN',
          data: data
        });
      }
    };
  }

  // Broadcasts shell stdout output to all connected visual terminals.
  broadcastToTerminals(data) {
    for (const [, port] of this.subscribers.entries()) {
      port.postMessage({
        action: 'STDOUT',
        data: data
      });
    }
  }

  unregisterTerminalPort(portId) {
    const port = this.subscribers.get(portId);
    if (port) {
      port.close();
      this.subscribers.delete(portId);
    }
  }
}
export { V86LinuxBridge };
