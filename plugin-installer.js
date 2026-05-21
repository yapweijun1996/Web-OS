// VORTEX-103: Reverse Proxy Engine for installing third-party CORS-protected plugins.
//
// Installing an external app means fetching its manifest.json cross-origin.
// Hosts that do not send `Access-Control-Allow-Origin` break a direct fetch,
// so this module: (1) validates the manifest origin against a safety policy,
// (2) fetches directly, falling back to a CORS proxy on failure, and
// (3) strictly sanitizes every manifest attribute before it reaches the host.

// Remote hosts trusted to serve plugin manifests. Same-origin and localhost
// are always allowed separately (see isOriginAllowed).
const TRUSTED_MANIFEST_HOSTS = [
  'raw.githubusercontent.com',
  'gist.githubusercontent.com',
  'cdn.jsdelivr.net'
];

// CORS bypass endpoint. When a manifest host omits CORS headers the direct
// fetch fails. The proxy URL is read at call time from localStorage so it can
// be set via the Settings panel without redeploying (VORTEX-108). Disabled by
// default.
// SECURITY: a proxy can intercept and substitute manifest content, so only
// point this at a self-hosted proxy you trust. sanitizeManifest still runs on
// every proxied response regardless of where it came from.
const LS_CORS_PROXY = 'vortex_cors_proxy_url';

function getCorsProxy() {
  try {
    const value = localStorage.getItem(LS_CORS_PROXY);
    return value && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

// Sliding-window rate limit for proxy calls: at most MAX_PROXY_CALLS fetches
// per PROXY_WINDOW_MS. Prevents the configured proxy from being hammered by a
// tight install loop (accidental or intentional).
const MAX_PROXY_CALLS = 5;
const PROXY_WINDOW_MS = 60_000;
const _proxyCallTimestamps = [];

function _checkProxyRateLimit() {
  const now = Date.now();
  while (_proxyCallTimestamps.length && _proxyCallTimestamps[0] <= now - PROXY_WINDOW_MS) {
    _proxyCallTimestamps.shift();
  }
  if (_proxyCallTimestamps.length >= MAX_PROXY_CALLS) {
    const retryAfterSec = Math.ceil((PROXY_WINDOW_MS - (now - _proxyCallTimestamps[0])) / 1000);
    throw new Error(`CORS proxy rate limit exceeded (${MAX_PROXY_CALLS} calls/${PROXY_WINDOW_MS / 1000}s). Retry in ${retryAfterSec}s.`);
  }
  _proxyCallTimestamps.push(now);
}

const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,127}$/;
const VERSION_PATTERN = /^[0-9]+(\.[0-9]+){0,3}([-+][a-zA-Z0-9.]+)?$/;
// The namespace segment allows hyphens so capability namespaces like
// `kb-mcp` are valid (VORTEX-109); colon-delimited segments already do.
const TOKEN_PATTERN = /^[a-zA-Z][a-zA-Z0-9-]*(:[a-zA-Z0-9/_.-]+)*$/;
const MAX_PERMISSIONS = 32;

// Origin safety validation: a manifest URL is accepted only if it is
// same-origin, localhost, or an HTTPS URL on a trusted host.
function isOriginAllowed(rawUrl) {
  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    return false;
  }
  if (u.origin === location.origin) return true;
  if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return true;
  if (u.protocol !== 'https:') return false;
  return TRUSTED_MANIFEST_HOSTS.includes(u.hostname);
}

// Fetches the raw manifest text. If the direct fetch fails AND a CORS proxy
// is configured (via Settings), retries through it. With no proxy configured,
// a CORS failure surfaces a descriptive error rather than silently forwarding
// to a third party.
async function fetchManifestText(url) {
  try {
    const res = await fetch(url);
    if (res.ok) return await res.text();
    throw new Error(`Manifest fetch failed (HTTP ${res.status}).`);
  } catch (directErr) {
    const proxy = getCorsProxy();
    if (!proxy) {
      throw new Error(
        `Cannot fetch manifest: ${directErr.message}. ` +
        'If the server lacks CORS headers, set a CORS proxy URL in Settings.'
      );
    }
    // Proxy fallback — only reached when a proxy URL is explicitly configured.
    _checkProxyRateLimit();
    const proxied = await fetch(proxy + encodeURIComponent(url));
    if (!proxied.ok) {
      throw new Error(`Manifest fetch failed via configured proxy (HTTP ${proxied.status}).`);
    }
    return await proxied.text();
  }
}

// Manifest strings land in the DOM (window titles, desktop labels) via
// textContent — HTML-significant characters are stripped here as
// defense-in-depth in case any future code path uses innerHTML.
function stripUnsafeText(value, maxLen) {
  return String(value == null ? '' : value)
    .replace(/[<>&"'`]/g, '')
    .slice(0, maxLen)
    .trim();
}

// Strict schema validation + sanitization. Returns a clean manifest object
// containing only known fields with verified shapes.
function sanitizeManifest(raw, manifestUrl) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Manifest must be a JSON object.');
  }

  const id = String(raw.id || '');
  if (!ID_PATTERN.test(id)) {
    throw new Error('Manifest "id" is missing or has an unsafe format.');
  }

  const name = stripUnsafeText(raw.name, 64);
  if (!name) {
    throw new Error('Manifest "name" is missing or empty after sanitization.');
  }

  const version = VERSION_PATTERN.test(String(raw.version || ''))
    ? String(raw.version)
    : '0.0.0';

  const entrypoint = String(raw.entrypoint || '');
  if (!entrypoint) {
    throw new Error('Manifest "entrypoint" is required.');
  }
  // Reject any entrypoint that does not resolve to plain http(s) - this blocks
  // javascript:/data:/blob: entrypoints that would execute on iframe load.
  let resolvedEntrypoint;
  try {
    resolvedEntrypoint = new URL(entrypoint, manifestUrl);
  } catch {
    throw new Error('Manifest "entrypoint" is not a resolvable URL.');
  }
  if (resolvedEntrypoint.protocol !== 'http:' && resolvedEntrypoint.protocol !== 'https:') {
    throw new Error(`Unsafe entrypoint protocol "${resolvedEntrypoint.protocol}".`);
  }

  let permissions = [];
  if (raw.permissions !== undefined) {
    if (!Array.isArray(raw.permissions)) {
      throw new Error('Manifest "permissions" must be an array.');
    }
    if (raw.permissions.length > MAX_PERMISSIONS) {
      throw new Error('Manifest declares too many permissions.');
    }
    permissions = raw.permissions.map((p) => {
      if (typeof p !== 'string' || !TOKEN_PATTERN.test(p)) {
        throw new Error(`Manifest contains an invalid permission token: ${JSON.stringify(p)}`);
      }
      // Block root-scoped FS tokens (fs:write:/ or fs:read:/) — they grant
      // unrestricted VFS access and defeat path-scope enforcement entirely.
      if (/^fs:(write|read):\/$/.test(p)) {
        throw new Error(`Manifest declares a root-scoped FS permission '${p}' which is not allowed.`);
      }
      return p;
    });
  }

  // Coerce sandbox to a strict boolean shape; unknown keys are dropped.
  // allowSameOrigin is never honored - the host always enforces cross-origin
  // isolation regardless of what the manifest requests.
  const rawSandbox = (raw.sandbox && typeof raw.sandbox === 'object') ? raw.sandbox : {};
  const sandbox = {
    allowScripts: rawSandbox.allowScripts !== false,
    allowDownloads: rawSandbox.allowDownloads === true,
    allowSameOrigin: false
  };

  // web_app: true → launchPlugin bypasses PluginHarness and opens the
  // entrypoint in an unsandboxed system window (for trusted external PWAs).
  const web_app = raw.web_app === true;

  // Store the fully-resolved absolute URL so launchPlugin never needs to
  // re-resolve a relative path against a manifestUrl, closing the supply-chain
  // attack where a CDN package update silently changes the entrypoint.
  return { id, name, version, entrypoint: resolvedEntrypoint.href, permissions, sandbox, web_app };
}

// Public entry point: validate origin -> fetch (direct or proxied) -> parse ->
// sanitize. Throws a descriptive Error on any failure.
async function installManifest(url) {
  const trimmed = String(url || '').trim();
  if (!trimmed) {
    throw new Error('Manifest URL is required.');
  }
  if (!isOriginAllowed(trimmed)) {
    throw new Error('Rejected: manifest origin failed safety validation (must be same-origin, localhost, or a trusted HTTPS host).');
  }

  const text = await fetchManifestText(trimmed);
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Manifest is not valid JSON.');
  }

  const manifest = sanitizeManifest(parsed, trimmed);
  return { manifest, manifestUrl: trimmed };
}

export { installManifest, sanitizeManifest, isOriginAllowed };
