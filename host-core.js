import { CompressedStorageEngine } from './jsonl-storage-engine.js';
import { KBProxy } from './kb-proxy.js';
import { IpcActions } from './contracts.js';
import { CapabilitySet } from './capability.js';

// VORTEX-105: maps a privileged IPC action to the single capability token that
// authorizes it. The plugin must declare this token in its manifest AND present
// it on the request — holding some other granted token is not enough.
const ACTION_REQUIRED_TOKEN = {
  [IpcActions.SYSTEM_NOTIFY]: 'system:notify',
  [IpcActions.KB_READ]:       'kb-mcp:read',
  [IpcActions.KB_WRITE]:      'kb-mcp:write'
};

// Non-blocking in-page notification banner — replaces blocking alert() so a
// plugin cannot freeze the tab by spamming SYSTEM_NOTIFY.
let _notifyStyleInjected = false;
function _showNotification(message) {
  if (!_notifyStyleInjected) {
    const s = document.createElement('style');
    s.textContent =
      '.vx-toast{position:fixed;bottom:24px;right:24px;background:#3a3a3c;color:#f2f2f7;' +
      'padding:12px 18px;border-radius:10px;font:13px/1.4 -apple-system,sans-serif;' +
      'box-shadow:0 4px 20px rgba(0,0,0,.6);z-index:99999;max-width:320px;' +
      'animation:vx-in .18s ease}' +
      '@keyframes vx-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}';
    document.head.appendChild(s);
    _notifyStyleInjected = true;
  }
  const el = document.createElement('div');
  el.className = 'vx-toast';
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

class PluginHarness {
  constructor(manifest, url, kbProxy = new KBProxy(), storage = null) {
    this.manifest = manifest;
    this.url = url;
    this.iframe = null;
    this.channel = null;
    this.capabilities = new CapabilitySet(manifest.permissions);

    // Accept an externally-managed storage engine so all PluginHarness instances
    // and the OrchestratorAgent share one write-chain map, preventing cross-
    // instance read-modify-write races on the same VFS path.
    if (storage) {
      this.storage = storage;
      this._storageReady = Promise.resolve();
      this._ownsStorage = false;
    } else {
      this.storage = new CompressedStorageEngine();
      this._storageReady = this.storage.init();
      this._ownsStorage = true;
    }

    this.kbProxy = kbProxy;

    // Per-plugin SYSTEM_NOTIFY rate limit: max 3 per 60-second window.
    this._notifyCount = 0;
    this._notifyWindowEnd = 0;
  }

  mount(containerElement) {
    this.iframe = document.createElement('iframe');
    this.iframe.style.width = '100%';
    this.iframe.style.height = '100%';
    this.iframe.style.border = 'none';

    const sandboxRules = ['allow-scripts'];
    if (this.manifest.sandbox?.allowDownloads) {
      sandboxRules.push('allow-downloads');
    }
    this.iframe.setAttribute('sandbox', sandboxRules.join(' '));
    this.iframe.src = this.url;

    this.channel = new MessageChannel();
    this.channel.port1.onmessage = (event) => {
      this.handleIpcRequest(event).catch(err => {
        try { this.channel.port1.postMessage({ error: err.message }); } catch (_) {}
      });
    };

    this.iframe.addEventListener('load', () => {
      this.iframe.contentWindow.postMessage({ type: IpcActions.INIT_PORT }, '*', [this.channel.port2]);
    });

    containerElement.appendChild(this.iframe);
  }

  async handleIpcRequest(event) {
    const { action, payload, token } = event.data;

    // Outer check: token must be in the plugin's declared capability set.
    if (!this.capabilities.has(token)) {
      this.channel.port1.postMessage({ error: 'Permission Denied.' });
      return;
    }

    await this._storageReady;

    switch (action) {
      case IpcActions.FS_WRITE: {
        if (!payload || typeof payload.path !== 'string' || !payload.path) {
          this.channel.port1.postMessage({ error: 'FS_WRITE requires payload.path (string).' });
          return;
        }
        // Inner check: the presented token must authorize fs:write on this
        // exact path — capability.js owns the verb + path-scope grammar.
        if (!this.capabilities.authorizes(token, 'fs:write', payload.path)) {
          this.channel.port1.postMessage({ error: 'Permission Denied: token does not authorize this path.' });
          return;
        }
        try {
          const data = typeof payload.data === 'string'
            ? payload.data
            : JSON.stringify(payload.data);
          await this.storage.appendToGzFile(payload.path, data);
          this.channel.port1.postMessage({ success: true });
        } catch (err) {
          this.channel.port1.postMessage({ error: err.message });
        }
        break;
      }

      case IpcActions.FS_READ: {
        if (!payload || typeof payload.path !== 'string' || !payload.path) {
          this.channel.port1.postMessage({ error: 'FS_READ requires payload.path (string).' });
          return;
        }
        if (!this.capabilities.authorizes(token, 'fs:read', payload.path)) {
          this.channel.port1.postMessage({ error: 'Permission Denied: token does not authorize this path.' });
          return;
        }
        try {
          const lines = await this.storage.readGzFileLines(payload.path);
          this.channel.port1.postMessage({ success: true, data: lines });
        } catch (err) {
          this.channel.port1.postMessage({ error: err.message });
        }
        break;
      }

      case IpcActions.SYSTEM_NOTIFY: {
        if (!payload || typeof payload.message !== 'string') {
          this.channel.port1.postMessage({ error: 'SYSTEM_NOTIFY requires payload.message (string).' });
          return;
        }
        // Only the 'system:notify' capability authorizes notifications — not
        // just any token the plugin happens to hold.
        if (!this.capabilities.authorizes(token, ACTION_REQUIRED_TOKEN[action])) {
          this.channel.port1.postMessage({
            error: `Permission Denied: action '${action}' requires the '${ACTION_REQUIRED_TOKEN[action]}' capability.`
          });
          return;
        }
        // Rate limit: max 3 notifications per 60-second window per plugin.
        const now = Date.now();
        if (now > this._notifyWindowEnd) {
          this._notifyCount = 0;
          this._notifyWindowEnd = now + 60_000;
        }
        if (this._notifyCount >= 3) {
          this.channel.port1.postMessage({ error: 'SYSTEM_NOTIFY rate limit exceeded (3/min).' });
          return;
        }
        this._notifyCount++;
        _showNotification(payload.message);
        this.channel.port1.postMessage({ success: true });
        break;
      }

      case IpcActions.KB_READ:
      case IpcActions.KB_WRITE: {
        if (!this.capabilities.authorizes(token, ACTION_REQUIRED_TOKEN[action])) {
          this.channel.port1.postMessage({
            error: `Permission Denied: action '${action}' requires the '${ACTION_REQUIRED_TOKEN[action]}' capability`
          });
          return;
        }
        try {
          const result = action === IpcActions.KB_READ
            ? await this.kbProxy.read(payload && payload.query)
            : await this.kbProxy.write(payload && payload.item);
          this.channel.port1.postMessage({ success: true, result });
        } catch (err) {
          this.channel.port1.postMessage({ error: `KB-MCP proxy error: ${err.message}` });
        }
        break;
      }

      default:
        this.channel.port1.postMessage({ error: 'Unknown Action Pattern' });
    }
  }

  destroy() {
    if (this.iframe) this.iframe.remove();
    if (this.channel) this.channel.port1.close();
  }
}
export { PluginHarness };
