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
// fetch fails. Set this to a self-hosted Cloudflare Worker / proxy URL to
// enable the fallback. Disabled by default: corsproxy.io (a public third-party
// service) is not trusted because it can intercept and substitute manifest
// content before sanitization runs.
const CORS_PROXY = null; // Set to 'https://your-proxy.example.com/?url=' to enable.

const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,127}$/;
const VERSION_PATTERN = /^[0-9]+(\.[0-9]+){0,3}([-+][a-zA-Z0-9.]+)?$/;
const TOKEN_PATTERN = /^[a-zA-Z][a-zA-Z0-9]*(:[a-zA-Z0-9/_.-]+)*$/;
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

// Fetches the raw manifest text. If the direct fetch fails AND a CORS_PROXY
// is configured, retries through it. With no proxy configured, a CORS failure
// surfaces a descriptive error rather than silently forwarding to a third party.
async function fetchManifestText(url) {
  try {
    const res = await fetch(url);
    if (res.ok) return await res.text();
    throw new Error(`Manifest fetch failed (HTTP ${res.status}).`);
  } catch (directErr) {
    if (!CORS_PROXY) {
      throw new Error(
        `Cannot fetch manifest: ${directErr.message}. ` +
        'If the server lacks CORS headers, configure a self-hosted proxy in plugin-installer.js.'
      );
    }
    // Proxy fallback — only reached when CORS_PROXY is explicitly configured.
    const proxied = await fetch(CORS_PROXY + encodeURIComponent(url));
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

  return { id, name, version, entrypoint, permissions, sandbox };
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
