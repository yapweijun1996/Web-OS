// SSOT for the capability-token allow-list model.
//
// A capability token is an opaque string a principal must present to perform
// a privileged operation. The host grants a fixed set of tokens to each
// principal — a sandboxed plugin (from its manifest `permissions`) or a
// background agent (from the kernel) — and every privileged call is checked
// against that set.
//
// PluginHarness and OrchestratorAgent share this one class, so the security
// check cannot drift between the plugin path and the agent path.

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
}

export { CapabilitySet };
