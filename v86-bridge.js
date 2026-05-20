// v86-bridge.js (English Coding Only)
//
// VORTEX-101: Host-side bridge between sandboxed terminal windows and the
// v86 WebAssembly Linux VM running inside a dedicated Web Worker. It owns the
// worker lifecycle and routes the stdin/stdout serial pipelines.

const _V86 = import.meta.env.BASE_URL + 'v86/';

class V86LinuxBridge {
  constructor(config = {}) {
    this.workerScript = config.workerScript || null;

    // Runtime resources handed to the worker. Defaults use BASE_URL so paths
    // resolve correctly regardless of the deployment sub-path (e.g. /Web-OS/).
    this.resources = {
      libUrl: config.libUrl || `${_V86}libv86.js`,
      wasmPath: config.wasmPath || `${_V86}v86.wasm`,
      biosUrl: config.biosUrl || `${_V86}seabios.bin`,
      vgaBiosUrl: config.vgaBiosUrl || `${_V86}vgabios.bin`,
      bzimageUrl: config.bzimageUrl || `${_V86}buildroot-bzimage68.bin`,
      initrdUrl: config.initrdUrl || null,
      cdromUrl: config.cdromUrl || null,
      hdaUrl: config.hdaUrl || null,
      networkRelayUrl: config.networkRelayUrl || null,
      netDevice: config.netDevice || null,
      cmdline: config.cmdline || 'console=ttyS0 earlyprintk=serial,ttyS0 root=/dev/ram0 rw',
      memorySize: config.memorySize || 128 * 1024 * 1024,
      vgaMemorySize: config.vgaMemorySize || 8 * 1024 * 1024
    };

    this.worker = null;
    this.status = 'idle'; // idle | booting | running | ready | error
    this.onStatusChange = config.onStatusChange || null;
    this.subscribers = new Map(); // Maps port ID to active MessagePorts
  }

  // Spawns the dedicated Web Worker running the v86 emulator.
  init() {
    this.worker = this.workerScript
      ? new Worker(this.workerScript)
      : new Worker(new URL('./v86-worker.js', import.meta.url));
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
        case 'BOOT_PROGRESS':
          this.broadcastToTerminals(data);
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

  // Terminates the emulator worker and closes all terminal ports. Call when
  // the terminal window is closed to release the Web Worker and its WASM heap.
  destroy() {
    for (const portId of [...this.subscribers.keys()]) {
      this.unregisterTerminalPort(portId);
    }
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this._setStatus('idle');
  }
}
export { V86LinuxBridge };
