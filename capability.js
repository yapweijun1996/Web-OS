// SSOT for the capability-token model: the allow-list, the token grammar, and
// the authorization check.
//
// A capability token a principal must present to perform a privileged
// operation. Two shapes exist:
//
//   flat    'system:notify'      a verb, no resource scope
//   scoped  'fs:write:/reports'  a verb bound to a '/'-rooted path subtree
//
// The host grants a fixed set of tokens to each principal — a sandboxed plugin
// (from its manifest `permissions`) or a background agent (from the kernel).
// PluginHarness and OrchestratorAgent share this one module, so the security
// check cannot drift between the plugin path and the agent path.

// Split a token into { verb, scope }. The scope is the path that starts at the
// ':/' boundary; a flat token has scope null. 'fs:write:/reports' parses to
// verb 'fs:write', scope '/reports'; 'system:notify' to verb-only.
function parseToken(token) {
  const i = token.indexOf(':/');
  return i === -1
    ? { verb: token, scope: null }
    : { verb: token.slice(0, i), scope: token.slice(i + 1) };
}

// True if `resourcePath` sits within `scope`: '/reports' covers '/reports' and
// any '/reports/...' descendant, but not the sibling '/reports-secret'.
function scopeCovers(scope, resourcePath) {
  if (resourcePath === scope) return true;
  const prefix = scope.endsWith('/') ? scope : scope + '/';
  return resourcePath.startsWith(prefix);
}

class CapabilitySet {
  constructor(grantedTokens = []) {
    this.granted = new Set(grantedTokens);
  }

  // True if `token` was granted to this principal.
  has(token) {
    return this.granted.has(token);
  }

  // Assert `token` was granted: returns it, or throws if it was not.
  request(token) {
    if (!this.granted.has(token)) {
      throw new Error(`Capability denied: '${token}' was not granted.`);
    }
    return token;
  }

  // True if `token` is granted AND authorizes operation `verb`. For a scoped
  // operation pass `resourcePath`: a flat token authorizes only resource-less
  // calls; a scoped token additionally requires `resourcePath` to fall within
  // the token's own scope. This is the single check a privileged action runs.
  authorizes(token, verb, resourcePath = null) {
    if (!this.granted.has(token)) return false;
    const cap = parseToken(token);
    if (cap.verb !== verb) return false;
    if (cap.scope === null) return resourcePath === null;
    return resourcePath !== null && scopeCovers(cap.scope, resourcePath);
  }
}

export { CapabilitySet };
