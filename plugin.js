let hostPort = null;

window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'INIT_PORT') {
    hostPort = event.ports[0];
    hostPort.onmessage = (e) => {
      console.log('[Plugin Inner] Received confirmation from Host:', e.data);
    };

    triggerSaveAction();
    triggerKbQuery();
  }
});

function triggerSaveAction() {
  if (!hostPort) return;

  hostPort.postMessage({
    action: 'fs:write',
    token: 'fs:write:/reports',
    payload: {
      path: '/reports/summary.jsonl',
      data: '{"event":"plugin_started"}\n'
    }
  });
}

// VORTEX-105: request a KB-MCP read through the capability-gated Host proxy.
function triggerKbQuery() {
  if (!hostPort) return;

  hostPort.postMessage({
    action: 'kb:read',
    token: 'kb-mcp:read',
    payload: { query: 'recent agent activity' }
  });
}
