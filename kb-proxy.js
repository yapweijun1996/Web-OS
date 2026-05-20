// VORTEX-105: Host-side proxy to the KB-MCP knowledge server.
//
// A sandboxed plugin iframe runs at a null origin and cannot fetch the KB
// server directly. The host page (real origin) performs the CORS-authorized
// request on the plugin's behalf — but only after PluginHarness has verified
// the plugin holds the matching capability token.
//
// Runtime configuration is read from localStorage so the user can set it once
// via the browser console without redeploying the app:
//
//   window.vortexKernel.configureKb({ apiKey: 'YOUR_KEY', kbId: 'YOUR_KB_ID' })
//
// API paths are confirmed live (return 401 not 404 against kb.yapweijun1996.com):
//   POST /v1/search  — vector search, body: { kb_id, query, limit? }
//   POST /v1/items   — create/update item, body: { kb_id, content, name?, metadata? }

const DEFAULT_BASE_URL = 'https://kb.yapweijun1996.com';
const LS_API_KEY = 'vortex_kb_api_key';
const LS_KB_ID   = 'vortex_kb_id';

class KBProxy {
  constructor(config = {}) {
    this.baseUrl   = config.baseUrl   || DEFAULT_BASE_URL;
    this.readPath  = config.readPath  || '/v1/search';
    this.writePath = config.writePath || '/v1/items';
    // Read credentials from config first, then fall back to localStorage so the
    // user can configure them at runtime via window.vortexKernel.configureKb().
    this.apiKey = config.apiKey || localStorage.getItem(LS_API_KEY) || '';
    this.kbId   = config.kbId   || localStorage.getItem(LS_KB_ID)   || '';
  }

  // Searches the knowledge base for items matching `query`.
  // The plugin payload may override the target KB ID via payload.kbId.
  async read(query, kbId) {
    const targetKb = kbId || this.kbId;
    if (!targetKb) {
      throw new Error('KB ID not configured. Call window.vortexKernel.configureKb({ kbId: "..." }).');
    }
    return this._request(this.readPath, { kb_id: targetKb, query });
  }

  // Writes a vector item into the knowledge base.
  // `item` should be { content, name?, metadata? }.
  async write(item, kbId) {
    const targetKb = kbId || this.kbId;
    if (!targetKb) {
      throw new Error('KB ID not configured. Call window.vortexKernel.configureKb({ kbId: "..." }).');
    }
    if (!item || !item.content) {
      throw new Error('KB write requires item.content.');
    }
    return this._request(this.writePath, { kb_id: targetKb, ...item });
  }

  async _request(path, body) {
    if (!this.apiKey) {
      throw new Error(
        'KB-MCP API key not set. Configure via: ' +
        'window.vortexKernel.configureKb({ apiKey: "YOUR_KEY" })'
      );
    }
    const response = await fetch(this.baseUrl + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': this.apiKey
      },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const hint = response.status === 401
        ? ' Check your API key: window.vortexKernel.configureKb({ apiKey: "..." })'
        : '';
      throw new Error(`KB-MCP request failed (HTTP ${response.status}).${hint}`);
    }
    try {
      return await response.json();
    } catch {
      throw new Error(`KB-MCP returned non-JSON response (HTTP ${response.status}).`);
    }
  }
}

export { KBProxy };
