// v86-worker.js (English Coding Only)
//
// VORTEX-101: Standalone Web Worker wrapper that boots a v86 WebAssembly x86
// VM (e.g. minimal Alpine Linux) off the browser's UI thread. It speaks the
// BOOT_EMULATOR / SERIAL_IN / SERIAL_OUT message contract with V86LinuxBridge
// over postMessage.
//
// Required runtime resources (supplied via the BOOT_EMULATOR payload):
//   libUrl      - v86 library script (libv86.js)
//   wasmPath    - v86 WebAssembly binary (v86.wasm)
//   biosUrl     - SeaBIOS image
//   vgaBiosUrl  - VGA BIOS image
//   bzimageUrl  - Linux kernel image for direct kernel boot
//   initrdUrl   - optional initramfs image
//   cdromUrl    - optional ISO image
//   hdaUrl      - optional bootable disk image (e.g. Alpine Linux)
//   networkRelayUrl - optional v86 network relay mode, e.g. "fetch"
//   netDevice   - optional v86 net_device config
//
// Default runtime binaries live under /public/v86. When any is missing the
// worker reports a clear BOOT_ERROR rather than failing silently.

let emulator = null;

function reportError(message) {
  self.postMessage({ type: 'BOOT_ERROR', data: message });
}

function reportProgress(message) {
  self.postMessage({ type: 'BOOT_PROGRESS', data: message });
}

self.onerror = (message, source, lineno, colno, error) => {
  const detail = error?.message || message || `${source || 'worker'}:${lineno || 0}:${colno || 0}`;
  reportError(`Worker runtime error: ${detail}`);
};

self.onunhandledrejection = (event) => {
  const reason = event?.reason;
  const detail = reason?.message || String(reason || 'unknown rejection');
  reportError(`Worker unhandled rejection: ${detail}`);
};

function bootEmulator(resources) {
  if (emulator) {
    reportError('Emulator already booted; ignoring duplicate BOOT_EMULATOR.');
    return;
  }

  // Load the v86 library. A missing libv86.js throws synchronously here.
  try {
    // v86's fetch relay checks window.location to upgrade browser fetches
    // from http to https. In a dedicated worker, self.location is the
    // equivalent global location object.
    if (typeof self.window === 'undefined') {
      self.window = self;
    }
    self.importScripts(resources.libUrl);
  } catch (err) {
    reportError(
      `Cannot load the v86 library from "${resources.libUrl}". ` +
      `Provide libv86.js and v86.wasm to enable the Linux VM. (${err.message})`
    );
    return;
  }

  const V86Class = self.V86 || self.V86Starter;
  if (typeof V86Class !== 'function') {
    reportError('v86 library loaded but no V86 constructor was exported.');
    return;
  }

  try {
    const options = {
      wasm_path: resources.wasmPath,
      bios: { url: resources.biosUrl },
      vga_bios: { url: resources.vgaBiosUrl },
      memory_size: resources.memorySize,
      vga_memory_size: resources.vgaMemorySize,
      cmdline: resources.cmdline,
      autostart: true,
      disable_keyboard: true,
      disable_mouse: true,
      uart0: true
    };

    if (resources.bzimageUrl) options.bzimage = { url: resources.bzimageUrl };
    if (resources.initrdUrl) options.initrd = { url: resources.initrdUrl };
    if (resources.cdromUrl) options.cdrom = { url: resources.cdromUrl, async: true };
    if (resources.hdaUrl) options.hda = { url: resources.hdaUrl, async: true };
    if (resources.networkRelayUrl) options.network_relay_url = resources.networkRelayUrl;
    if (resources.netDevice) options.net_device = resources.netDevice;

    reportProgress('[Vortex OS] Starting v86 real-kernel Linux...\r\n');
    emulator = new V86Class(options);
  } catch (err) {
    emulator = null;
    reportError(`Failed to construct the v86 emulator: ${err.message}`);
    return;
  }

  // Pipe Serial Out (stdout) bytes from the VM back to the bridge so the
  // terminal window can render them in real time.
  emulator.add_listener('serial0-output-byte', (byte) => {
    self.postMessage({ type: 'SERIAL_OUT', data: String.fromCharCode(byte) });
  });

  // Surface a download failure of any resource (BIOS / disk image) clearly.
  emulator.add_listener('download-error', (detail) => {
    const file = detail && detail.file_name ? detail.file_name : 'unknown resource';
    reportError(`Failed to download VM resource "${file}".`);
  });

  emulator.add_listener('download-progress', (detail) => {
    if (!detail || !detail.file_name || !detail.total) return;
    const done = Math.round((detail.loaded / detail.total) * 100);
    reportProgress(`\r[Vortex OS] Loading ${detail.file_name}: ${done}%`);
    if (done >= 100) reportProgress('\r\n');
  });

  emulator.add_listener('emulator-ready', () => {
    self.postMessage({ type: 'BOOT_READY' });
  });

  self.postMessage({ type: 'BOOT_STARTED' });
}

self.onmessage = (event) => {
  const { action, payload, data } = event.data || {};

  switch (action) {
    case 'BOOT_EMULATOR':
      bootEmulator(payload || {});
      break;

    case 'SERIAL_IN':
      // Route keystrokes (stdin) straight to the emulator's serial port.
      if (emulator) {
        emulator.serial0_send(data);
      }
      break;

    default:
      reportError(`Unknown worker action: ${action}`);
  }
};
