// VORTEX-104: Event Hook Interceptors & Multi-Agent Orchestrator.
//
// SystemEventBus is the kernel-level hook surface: subsystems emit system
// triggers (app launches, file opens, commands) and background agents listen.
// OrchestratorAgent listens on the bus and, gated by a CapabilitySet (the
// shared capability-token model in capability.js), compiles an activity
// report into the VFS without human intervention.

import { SystemEvents } from './contracts.js';

class SystemEventBus {
  constructor() {
    this._target = new EventTarget();
  }

  // Subscribe to a system trigger. Returns an unsubscribe function.
  on(type, handler) {
    const wrapped = (e) => handler(e.detail);
    this._target.addEventListener(type, wrapped);
    return () => this._target.removeEventListener(type, wrapped);
  }

  // Emit a system trigger. The detail is frozen so a listening agent cannot
  // mutate kernel state through a shared object reference.
  emit(type, detail = {}) {
    this._target.dispatchEvent(new CustomEvent(type, { detail: Object.freeze({ ...detail }) }));
  }
}

// System triggers the orchestrator reacts to.
const ORCHESTRATED_EVENTS = [SystemEvents.APP_LAUNCH, SystemEvents.FILE_OPEN, SystemEvents.COMMAND_SEND];

class OrchestratorAgent {
  constructor({ bus, storage, guard, agentId = 'com.vortex.kernel.orchestrator', reportPath = '/reports/agent-activity.jsonl' }) {
    this.bus = bus;
    this.storage = storage;
    this.guard = guard;
    this.agentId = agentId;
    this.reportPath = reportPath;
    this._subscriptions = [];
    this.running = false;
  }

  // Boot the agent. Requires the agent:orchestrate capability to even start.
  start() {
    this.guard.request('agent:orchestrate');
    if (this.running) return;
    this.running = true;
    for (const type of ORCHESTRATED_EVENTS) {
      this._subscriptions.push(this.bus.on(type, (detail) => this._onSystemEvent(type, detail)));
    }
    console.log('[Orchestrator] online - listening for system triggers:', ORCHESTRATED_EVENTS.join(', '));
  }

  async _onSystemEvent(type, detail) {
    if (!this.running) return;

    // Securely request the write capability before touching the VFS.
    let token;
    try {
      token = this.guard.request('fs:write:/reports');
    } catch (err) {
      console.warn('[Orchestrator]', err.message);
      return;
    }

    const record = {
      ts: new Date().toISOString(),
      agent: this.agentId,
      event: type,
      detail,
      grantedBy: token
    };
    // Auto-save path (VORTEX-102): debounced, serialized append into the VFS.
    this.storage.queueLine(this.reportPath, JSON.stringify(record));
    console.log(`[Orchestrator] system event '${type}' compiled into VFS report ${this.reportPath}`);
  }

  stop() {
    this.running = false;
    this._subscriptions.forEach((unsub) => unsub());
    this._subscriptions = [];
  }
}

export { SystemEventBus, OrchestratorAgent };
