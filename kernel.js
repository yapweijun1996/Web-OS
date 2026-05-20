import { PluginHarness } from './host-core.js';
import { installManifest, isOriginAllowed } from './plugin-installer.js';
import { CompressedStorageEngine } from './jsonl-storage-engine.js';
import { SystemEventBus, OrchestratorAgent } from './agent-core.js';
import { SystemEvents } from './contracts.js';
import { CapabilitySet } from './capability.js';
import { WindowManager } from './window-manager.js';
import { KBProxy } from './kb-proxy.js';
import { AppRegistry } from './app-registry.js';

// The installed-plugin registry — load / validate / persist all live in
// app-registry.js, which owns the localStorage key.
const appRegistry = new AppRegistry();

// Non-blocking status feedback — replaces alert() so the install dialog
// cannot freeze the event loop or be spammed into a tab lock.
function showToast(message) {
  const el = document.createElement('div');
  el.className = 'vx-toast';
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// VORTEX-104: kernel event bus + background multi-agent orchestrator.
// VORTEX-102: the storage engine doubles as the VFS the orchestrator
// auto-saves activity reports into.
const systemBus = new SystemEventBus();
const storageEngine = new CompressedStorageEngine();
let orchestrator = null;

(async () => {
  await storageEngine.init();
  // The kernel grants the orchestrator exactly the capabilities it needs.
  const orchestratorGuard = new CapabilitySet(['agent:orchestrate', 'fs:write:/reports']);
  orchestrator = new OrchestratorAgent({
    bus: systemBus,
    storage: storageEngine,
    guard: orchestratorGuard
  });
  orchestrator.start();
  // Defer rendering plugin icons until the storage engine is ready so
  // launchPlugin cannot be called with an uninitialized IndexedDB handle.
  renderInstalledApps();
})();

// Durability barrier (VORTEX-102): flush pending auto-save buffers when the
// tab is hidden or closed. visibilitychange fires before the page is torn
// down and allows async IDB writes to complete, unlike beforeunload which
// ignores the returned Promise and may not wait for IndexedDB commits.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) storageEngine.flushAll();
});

// Kernel introspection surface — intentionally narrow.
// `bus` and `storage` are NOT exposed: direct access bypasses the
// capability model and would let any same-origin console script or XSS
// payload read all VFS data or inject arbitrary events without a token.
window.vortexKernel = {
  getProcessTelemetry() {
    return wm.getProcessTelemetry();
  },
  get orchestrator() { return orchestrator; },
  // VORTEX-105: runtime KB config without redeployment.
  // Usage: window.vortexKernel.configureKb({ apiKey: 'YOUR_KEY', kbId: 'YOUR_KB_ID' })
  configureKb({ apiKey, kbId } = {}) {
    if (apiKey) localStorage.setItem('vortex_kb_api_key', apiKey);
    if (kbId)   localStorage.setItem('vortex_kb_id', kbId);
    console.log('[Vortex] KB config updated. Relaunch any running plugins to apply.');
  }
};

// The Window Management System owns every open window: stacking, focus,
// minimize-to-Dock, maximize, and drag (see window-manager.js).
const DOCK_APP_TARGETS = [
  { buttonId: 'dashboard-dock-btn', src: 'dashboard.html' },
  { buttonId: 'files-dock-btn', src: 'files.html' },
  { buttonId: 'terminal-dock-btn', src: 'terminal.html' }
];

function updateDockIndicators() {
  for (const { buttonId, src } of DOCK_APP_TARGETS) {
    const button = document.getElementById(buttonId);
    const isActive = wm.windows.some((win) => {
      const iframe = win.querySelector('iframe');
      return iframe && iframe.getAttribute('src') === src;
    });
    button?.classList.toggle('active', isActive);
    button?.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  }
}

const wm = new WindowManager({
  desktop: document.getElementById('desktop'),
  dock: document.getElementById('dock'),
  onChange: updateDockIndicators
});

// Standard Window Opener: a system iframe pointed at a same-origin page.
window.openWindow = function(title, src) {
  const win = wm.open({
    title,
    fillBody(body) {
      const iframe = document.createElement('iframe');
      // Trusted same-origin system apps run unsandboxed. Sandboxing them
      // with allow-scripts + allow-same-origin triggers Chrome's escape
      // warning; third-party plugins remain sandboxed in PluginHarness.
      iframe.src = src;
      body.appendChild(iframe);
    }
  });
  win.dataset.appSrc = src;
  updateDockIndicators();
  // VORTEX-104: surface the launch as a system trigger on the event bus.
  systemBus.emit(SystemEvents.APP_LAUNCH, { title, src, kind: 'system' });
  return win;
};

function focusSystemWindow(src) {
  const win = wm.windows.find((candidate) => candidate.dataset.appSrc === src);
  if (!win) return false;
  wm.restore(win);
  updateDockIndicators();
  return true;
}

function openOrFocusSystemWindow(title, src) {
  if (focusSystemWindow(src)) return;
  window.openWindow(title, src);
}

function openDashboard() {
  openOrFocusSystemWindow('Dashboard', 'dashboard.html');
}

function openFiles() {
  openOrFocusSystemWindow('Files', 'files.html');
}

function openTerminal() {
  openOrFocusSystemWindow('Terminal', 'terminal.html');
}

function openMonitor() {
  window.openWindow('Activity Monitor', 'monitor.html');
}

function openNotes() {
  window.openWindow('Vortex Notes', 'notes.html');
}

// Advanced Window Opener for Sandboxed Plugins.
window.launchPlugin = function(manifest, manifestUrl) {
  // Re-validate the manifest origin at launch time so a manipulated
  // localStorage entry with a swapped manifestUrl cannot slip through.
  if (!isOriginAllowed(manifestUrl)) {
    console.error('[Vortex] Rejected plugin with untrusted manifestUrl at launch:', manifestUrl);
    return;
  }

  // Resolve absolute entrypoint and re-validate the protocol.
  // sanitizeManifest already stored a resolved absolute href, so the URL()
  // call here is a pure no-op for valid installs and a safety net for any
  // tampered entry that slipped past the AppRegistry load-time re-validation.
  const resolvedEntrypoint = new URL(manifest.entrypoint, manifestUrl).href;
  if (!resolvedEntrypoint.startsWith('https://') && !resolvedEntrypoint.startsWith('http://')) {
    console.error('[Vortex] Rejected unsafe entrypoint protocol:', resolvedEntrypoint);
    return;
  }

  wm.open({
    title: `${manifest.name} (v${manifest.version})`,
    fillBody(body) {
      // Pass the shared storageEngine so all PluginHarness instances and the
      // OrchestratorAgent serialize writes on the same per-path write chain.
      const harness = new PluginHarness(manifest, resolvedEntrypoint, undefined, storageEngine);
      harness.mount(body);
      return () => harness.destroy();
    }
  });

  // VORTEX-104: surface the plugin launch as a system trigger.
  systemBus.emit(SystemEvents.APP_LAUNCH, { app: manifest.id, name: manifest.name, kind: 'plugin' });
};

// Render installed plugins dynamically
function renderInstalledApps() {
  const desktop = document.getElementById('desktop');
  desktop.querySelectorAll('.plugin-app-icon').forEach(icon => icon.remove());

  appRegistry.list().forEach(app => {
    const icon = document.createElement('div');
    icon.className = 'desktop-icon plugin-app-icon';
    icon.onclick = () => window.launchPlugin(app.manifest, app.manifestUrl);

    const iconImg = document.createElement('span');
    iconImg.className = 'icon-img';
    iconImg.textContent = '🧩';

    const iconLabel = document.createElement('span');
    iconLabel.className = 'icon-label';
    iconLabel.textContent = app.manifest.name;

    icon.append(iconImg, iconLabel);
    desktop.appendChild(icon);
  });
}

// Modal control helper
const modal = document.getElementById('add-app-modal');
const dashboardDockBtn = document.getElementById('dashboard-dock-btn');
const filesDockBtn = document.getElementById('files-dock-btn');
const terminalDockBtn = document.getElementById('terminal-dock-btn');
const addDockBtn = document.getElementById('add-app-dock-btn');
const cancelModalBtn = document.getElementById('cancel-modal-btn');
const installAppBtn = document.getElementById('install-app-btn');
const manifestInput = document.getElementById('manifest-url-input');

function openAddAppModal() {
  modal.style.display = 'block';
  manifestInput.value = window.location.origin + '/manifest.json';
}

dashboardDockBtn.addEventListener('click', openDashboard);
filesDockBtn.addEventListener('click', openFiles);
terminalDockBtn.addEventListener('click', openTerminal);
addDockBtn.addEventListener('click', openAddAppModal);

cancelModalBtn.addEventListener('click', () => {
  modal.style.display = 'none';
});

installAppBtn.addEventListener('click', async () => {
  const url = manifestInput.value.trim();
  if (!url) return;

  try {
    // VORTEX-103: origin-validated fetch (direct + CORS-proxy fallback)
    // followed by strict manifest sanitization.
    const { manifest, manifestUrl } = await installManifest(url);

    appRegistry.add(manifest, manifestUrl);

    renderInstalledApps();
    modal.style.display = 'none';
    showToast(`Installed: ${manifest.name}`);
  } catch (err) {
    showToast(`Install failed: ${err.message}`);
  }
});

// VORTEX-108: Settings panel — configure the CORS proxy URL that
// plugin-installer.js falls back to when a manifest host lacks CORS headers.
const settingsModal = document.getElementById('settings-modal');
const corsProxyInput = document.getElementById('cors-proxy-input');
const kbIdInput = document.getElementById('kb-id-input');
const kbApiKeyInput = document.getElementById('kb-api-key-input');
const kbSettingsStatus = document.getElementById('kb-settings-status');
const checkKbSettingsBtn = document.getElementById('check-kb-settings-btn');
const cancelSettingsBtn = document.getElementById('cancel-settings-btn');
const saveSettingsBtn = document.getElementById('save-settings-btn');

function getKbSettingsState() {
  return {
    hasKey: Boolean(localStorage.getItem('vortex_kb_api_key')),
    hasKbId: Boolean((localStorage.getItem('vortex_kb_id') || '').trim())
  };
}

function setKbSettingsStatus(message, level = 'warn') {
  kbSettingsStatus.textContent = message;
  kbSettingsStatus.className = `settings-status ${level}`;
}

function updateKbSettingsStatus() {
  const { hasKey, hasKbId } = getKbSettingsState();
  if (!hasKey && !hasKbId) {
    setKbSettingsStatus('KB-MCP is not configured: missing KB ID and API key.', 'warn');
  } else if (!hasKbId) {
    setKbSettingsStatus('KB-MCP is missing a KB ID.', 'warn');
  } else if (!hasKey) {
    setKbSettingsStatus('KB-MCP is missing an API key.', 'warn');
  } else {
    setKbSettingsStatus('KB-MCP is configured. Saved key is hidden.', 'ok');
  }
}

function saveKbSettings() {
  const kbId = kbIdInput.value.trim();
  const apiKey = kbApiKeyInput.value.trim();
  if (kbId) {
    localStorage.setItem('vortex_kb_id', kbId);
  } else {
    localStorage.removeItem('vortex_kb_id');
  }
  if (apiKey) {
    localStorage.setItem('vortex_kb_api_key', apiKey);
  }
  kbApiKeyInput.value = '';
  updateKbSettingsStatus();
}

// Desktop wallpaper picker — swatches preview immediately, while Save
// persists the selected background so Cancel can still restore the prior
// wallpaper.
const WALLPAPERS = {
  Aurora: 'radial-gradient(ellipse 80% 60% at 25% 0%, rgba(122,90,210,0.45), transparent 60%), radial-gradient(ellipse 90% 70% at 85% 100%, rgba(30,120,210,0.40), transparent 60%), linear-gradient(165deg, #241a44 0%, #14143a 45%, #0c1330 100%)',
  Midnight: 'linear-gradient(160deg, #10131f 0%, #07070d 100%)',
  Sunset: 'radial-gradient(ellipse 90% 70% at 80% 0%, rgba(255,138,90,0.45), transparent 60%), linear-gradient(165deg, #3a1f3d 0%, #1b1531 60%, #0c1020 100%)',
  Graphite: 'linear-gradient(165deg, #3a3a3e 0%, #232327 100%)'
};
const DEFAULT_WALLPAPER = 'Aurora';
const wallpaperGrid = document.getElementById('wallpaper-grid');
let pendingWallpaper = null;

function currentWallpaper() {
  const saved = localStorage.getItem('vortex_wallpaper');
  return WALLPAPERS[saved] ? saved : DEFAULT_WALLPAPER;
}

function applyWallpaper(name) {
  document.body.style.background = WALLPAPERS[name] || WALLPAPERS[DEFAULT_WALLPAPER];
}

function saveWallpaper(name) {
  if (WALLPAPERS[name]) {
    localStorage.setItem('vortex_wallpaper', name);
  }
}

function renderWallpaperGrid() {
  const active = pendingWallpaper || currentWallpaper();
  wallpaperGrid.replaceChildren();
  for (const [name, bg] of Object.entries(WALLPAPERS)) {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'wallpaper-swatch' + (name === active ? ' selected' : '');
    swatch.style.background = bg;
    swatch.title = name;
    swatch.setAttribute('aria-label', `Wallpaper: ${name}`);
    swatch.setAttribute('aria-pressed', name === active ? 'true' : 'false');
    swatch.addEventListener('click', () => {
      pendingWallpaper = name;
      applyWallpaper(name);
      renderWallpaperGrid();
    });
    wallpaperGrid.appendChild(swatch);
  }
}

// Apply the saved wallpaper on startup.
applyWallpaper(currentWallpaper());

function openSettings() {
  corsProxyInput.value = localStorage.getItem('vortex_cors_proxy_url') || '';
  kbIdInput.value = localStorage.getItem('vortex_kb_id') || '';
  kbApiKeyInput.value = '';
  pendingWallpaper = currentWallpaper();
  renderWallpaperGrid();
  updateKbSettingsStatus();
  settingsModal.style.display = 'block';
}

cancelSettingsBtn.addEventListener('click', () => {
  pendingWallpaper = currentWallpaper();
  applyWallpaper(pendingWallpaper);
  settingsModal.style.display = 'none';
});

saveSettingsBtn.addEventListener('click', () => {
  const value = corsProxyInput.value.trim();
  saveWallpaper(pendingWallpaper || currentWallpaper());
  saveKbSettings();
  if (value) {
    localStorage.setItem('vortex_cors_proxy_url', value);
  } else {
    localStorage.removeItem('vortex_cors_proxy_url');
  }
  settingsModal.style.display = 'none';
});

checkKbSettingsBtn.addEventListener('click', async () => {
  saveKbSettings();
  const { hasKey, hasKbId } = getKbSettingsState();
  if (!hasKbId) {
    setKbSettingsStatus('KB-MCP check skipped: missing KB ID.', 'warn');
    return;
  }
  if (!hasKey) {
    setKbSettingsStatus('KB-MCP check skipped: missing API key.', 'warn');
    return;
  }

  checkKbSettingsBtn.disabled = true;
  setKbSettingsStatus('Checking KB-MCP connection...', 'warn');
  try {
    await new KBProxy().read('vortex settings health check');
    setKbSettingsStatus('KB-MCP check passed.', 'ok');
  } catch (err) {
    setKbSettingsStatus(`KB-MCP request failed: ${err.message}`, 'error');
  } finally {
    checkKbSettingsBtn.disabled = false;
  }
});

// ---- Desktop context panel ----
const desktopEl = document.getElementById('desktop');
const desktopContextPanel = document.getElementById('desktop-context-panel');

function closeDesktopContextPanel() {
  desktopContextPanel.hidden = true;
}

function openDesktopContextPanel(x, y) {
  closeMenu();
  desktopContextPanel.hidden = false;

  const panelRect = desktopContextPanel.getBoundingClientRect();
  const left = Math.min(x, window.innerWidth - panelRect.width - 8);
  const top = Math.min(y, window.innerHeight - panelRect.height - 8);
  desktopContextPanel.style.left = `${Math.max(8, left)}px`;
  desktopContextPanel.style.top = `${Math.max(8, top)}px`;
  desktopContextPanel.querySelector('.context-panel-item')?.focus({ preventScroll: true });
}

function getDesktopContextItems() {
  return [...desktopContextPanel.querySelectorAll('.context-panel-item:not([disabled])')];
}

function focusDesktopContextItem(index) {
  const items = getDesktopContextItems();
  if (!items.length) return;

  const nextIndex = (index + items.length) % items.length;
  items[nextIndex].focus({ preventScroll: true });
}

function moveDesktopContextFocus(delta) {
  const items = getDesktopContextItems();
  if (!items.length) return;

  const currentIndex = items.indexOf(document.activeElement);
  focusDesktopContextItem(currentIndex === -1 ? 0 : currentIndex + delta);
}

function handleDesktopContextPanelKeydown(e) {
  if (desktopContextPanel.hidden) return false;

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      moveDesktopContextFocus(1);
      return true;
    case 'ArrowUp':
      e.preventDefault();
      moveDesktopContextFocus(-1);
      return true;
    case 'Home':
      e.preventDefault();
      focusDesktopContextItem(0);
      return true;
    case 'End':
      e.preventDefault();
      focusDesktopContextItem(getDesktopContextItems().length - 1);
      return true;
    default:
      return false;
  }
}

desktopEl.addEventListener('contextmenu', (e) => {
  if (e.target.closest('.window')) return;
  e.preventDefault();
  openDesktopContextPanel(e.clientX, e.clientY);
});

desktopContextPanel.addEventListener('click', (e) => {
  const item = e.target.closest('[data-context-action]');
  if (!item) return;

  closeDesktopContextPanel();
  switch (item.dataset.contextAction) {
    case 'new-plugin':
      openAddAppModal();
      break;
    case 'storage-tests':
      window.openWindow('Storage Tests', 'test.html');
      break;
    case 'terminal':
      openTerminal();
      break;
    case 'monitor':
      openMonitor();
      break;
    case 'notes':
      openNotes();
      break;
    case 'refresh':
      renderInstalledApps();
      showToast('Desktop refreshed');
      break;
    case 'settings':
      openSettings();
      break;
  }
});

// Live menu bar clock
function updateClock() {
  const d = new Date();
  const date = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  document.getElementById('menu-clock').textContent = `${date}  ${h}:${m} ${ampm}`;
}
updateClock();
setInterval(updateClock, 10000);

// Live FPS meter: count rAF callbacks over a rolling 1s window so the
// reading reflects the browser's true paint cadence, not a fixed timer.
const fpsEl = document.getElementById('menu-fps');
let frameCount = 0;
let fpsWindowStart = performance.now();
function fpsLoop(now) {
  frameCount++;
  const elapsed = now - fpsWindowStart;
  if (elapsed >= 1000) {
    const fps = Math.round((frameCount * 1000) / elapsed);
    fpsEl.textContent = `${fps} FPS`;
    frameCount = 0;
    fpsWindowStart = now;
  }
  requestAnimationFrame(fpsLoop);
}
requestAnimationFrame(fpsLoop);

// ---- Menu-bar dropdown system ----
// Each menu is a list of items; an item either runs an action or is a
// separator. Window actions reuse the existing traffic-light controls so
// behavior stays identical to clicking those buttons directly.
function focusedWindow() {
  return document.querySelector('.window.focused');
}

function clickWindowControl(selector) {
  focusedWindow()?.querySelector(selector)?.click();
}

const MENUS = {
  apple: [
    { label: 'About Vortex OS', action: () => alert('Vortex OS\nA vanilla web operating system.\nVersion 1.0.0') },
    { separator: true },
    { label: 'System Settings…', action: openSettings }
  ],
  File: [
    { label: 'New Plugin App…', action: openAddAppModal },
    { separator: true },
    { label: 'Close Window', shortcut: '⌃⌥W', needsWindow: true, action: () => clickWindowControl('.win-close') }
  ],
  Edit: [
    { label: 'Cut', shortcut: '⌘X', action: () => document.execCommand('cut') },
    { label: 'Copy', shortcut: '⌘C', action: () => document.execCommand('copy') },
    { separator: true },
    { label: 'Select All', shortcut: '⌘A', action: () => document.execCommand('selectAll') }
  ],
  View: [
    { label: 'Reload Window', shortcut: '⌃⌥R', needsWindow: true, action: () => { const f = focusedWindow()?.querySelector('iframe'); if (f) f.src = f.src; } },
    { label: 'Enter Full Screen', needsWindow: true, action: () => { const w = focusedWindow(); if (w) wm.toggleMaximize(w); } }
  ],
  Window: [
    { label: 'Minimize', shortcut: '⌃⌥M', needsWindow: true, action: () => { const w = focusedWindow(); if (w) wm.minimize(w); } },
    { label: 'Zoom', needsWindow: true, action: () => { const w = focusedWindow(); if (w) wm.toggleMaximize(w); } },
    { separator: true },
    { label: 'Close', shortcut: '⌃⌥W', needsWindow: true, action: () => clickWindowControl('.win-close') }
  ],
  Help: [
    { label: 'Vortex OS Help', action: () => alert('Vortex OS Help\n\n• Click a desktop icon or Dock app to open a window.\n• Traffic lights: red closes, yellow minimizes to the Dock, green zooms.\n• Drag a window by its title bar.\n• Use the + button in the Dock to install a sandboxed plugin.') }
  ]
};

let openMenuTrigger = null;
let menuDropdownEl = null;

function closeMenu() {
  if (menuDropdownEl) { menuDropdownEl.remove(); menuDropdownEl = null; }
  if (openMenuTrigger) { openMenuTrigger.classList.remove('menu-open'); openMenuTrigger = null; }
}

function openMenu(trigger) {
  const items = MENUS[trigger.dataset.menu];
  if (!items) return;
  closeMenu();
  openMenuTrigger = trigger;
  trigger.classList.add('menu-open');

  const dd = document.createElement('div');
  dd.className = 'menu-dropdown';
  dd.style.left = trigger.offsetLeft + 'px';
  dd.addEventListener('click', (e) => e.stopPropagation());

  items.forEach(item => {
    if (item.separator) {
      const sep = document.createElement('div');
      sep.className = 'menu-dropdown-sep';
      dd.appendChild(sep);
      return;
    }
    const disabled = item.needsWindow && !focusedWindow();
    const row = document.createElement('div');
    row.className = 'menu-dropdown-item' + (disabled ? ' disabled' : '');

    const label = document.createElement('span');
    label.textContent = item.label;
    row.appendChild(label);

    if (item.shortcut) {
      const sc = document.createElement('span');
      sc.className = 'menu-dropdown-shortcut';
      sc.textContent = item.shortcut;
      row.appendChild(sc);
    }

    if (!disabled) {
      row.addEventListener('click', () => {
        closeMenu();
        item.action();
      });
    }
    dd.appendChild(row);
  });

  document.getElementById('menubar').appendChild(dd);
  menuDropdownEl = dd;
}

document.querySelectorAll('#menubar [data-menu]').forEach(trigger => {
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    if (openMenuTrigger === trigger) closeMenu();
    else openMenu(trigger);
  });
  // While a menu is already open, hovering another menu switches to it.
  trigger.addEventListener('mouseenter', () => {
    if (openMenuTrigger && openMenuTrigger !== trigger) openMenu(trigger);
  });
});

// Wire static desktop icons declared with data-open-src — avoids inline
// onclick attributes which are blocked by script-src 'self'.
document.getElementById('desktop').addEventListener('click', (e) => {
  const icon = e.target.closest('[data-open-src]');
  if (!icon) return;
  const src = icon.dataset.openSrc;
  const label = icon.querySelector('.icon-label')?.textContent || src;
  window.openWindow(label, src);
});

document.addEventListener('click', (e) => {
  closeMenu();
  if (!desktopContextPanel.contains(e.target)) closeDesktopContextPanel();
});
document.addEventListener('keydown', (e) => {
  if (handleDesktopContextPanelKeydown(e)) return;

  if (e.key === 'Escape') {
    closeMenu();
    closeDesktopContextPanel();
    return;
  }
  // Window shortcuts use Ctrl+Alt: the macOS Cmd equivalents (Cmd+W/M/R)
  // are reserved by the browser/OS and cannot be intercepted by a page.
  // e.code is layout-independent, so Option's character remapping on
  // macOS does not matter here.
  if (e.ctrlKey && e.altKey && !e.metaKey) {
    const w = focusedWindow();
    if (!w) return;
    if (e.code === 'KeyW') { e.preventDefault(); clickWindowControl('.win-close'); }
    else if (e.code === 'KeyM') { e.preventDefault(); wm.minimize(w); }
    else if (e.code === 'KeyR') {
      e.preventDefault();
      const f = w.querySelector('iframe');
      if (f) f.src = f.src;
    }
  }
});
