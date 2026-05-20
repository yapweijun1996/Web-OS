# Vortex OS - Custom Context Menu Design & Implementation Guide

This guide provides a comprehensive technical breakdown and copy-paste-ready codebase reference for implementing a high-fidelity, desktop-grade custom context menu (right-click panel) inside a web-based operating system interface.

---

## 1. Core Architectural & UX Requirements

A custom context menu in a web OS must transcend basic browser popups and mimic authentic desktop environments by honoring four essential behaviors:

1. **Native Suppression**: Intercepting and canceling the browser's default context menu via `e.preventDefault()`.
2. **Dynamic Coordinate Alignment**: Extracting precise cursor position coordinates from the pointer event (`clientX`, `clientY`) to anchor the element.
3. **Viewport Collision Detection (Boundary Clamping)**: Dynamically calculating the panel's bounding dimensions to ensure it never clips past the screen boundaries, utilizing clamping math:
   - `clampedX = Math.min(cursorX, viewportWidth - menuWidth - margin)`
   - `finalX = Math.max(margin, clampedX)`
4. **Keyboard Focus & Outside-Dismissal Lifecycle**: Focusing the first menu item when the panel opens, supporting roving focus with `ArrowUp`, `ArrowDown`, `Home`, and `End`, then closing the menu when clicking outside of its bounding box, hitting the `Escape` key, or selecting a menu option.

---

## 2. HTML Implementation (Semantic & ARIA compliant)

Using clean semantic HTML with ARIA roles guarantees screen-reader accessibility and structural compliance with desktop menu specifications:

```html
<!-- Custom Context Menu Container -->
<div id="desktop-context-panel" class="context-panel" role="menu" hidden>
  <button type="button" class="context-panel-item" role="menuitem" data-context-action="new-plugin">
    New Plugin App...
  </button>
  <button type="button" class="context-panel-item" role="menuitem" data-context-action="storage-tests">
    Open Storage Tests
  </button>
  <button type="button" class="context-panel-item" role="menuitem" data-context-action="terminal">
    Open Terminal
  </button>
  <button type="button" class="context-panel-item" role="menuitem" data-context-action="monitor">
    Open Activity Monitor
  </button>
  <button type="button" class="context-panel-item" role="menuitem" data-context-action="notes">
    Open Vortex Notes
  </button>
  
  <!-- Separator for grouping related actions -->
  <div class="context-panel-sep" role="separator"></div>
  
  <button type="button" class="context-panel-item" role="menuitem" data-context-action="refresh">
    Refresh Desktop
  </button>
  <button type="button" class="context-panel-item" role="menuitem" data-context-action="settings">
    System Settings...
  </button>
</div>
```

---

## 3. CSS Implementation (Glassmorphism & OS Aesthetics)

To achieve the premium look and feel of modern operating systems, we apply backdrop saturations, subtle borders, drop shadows, and absolute positioning:

```css
:root {
  --accent: #0a84ff;         /* Native OS Blue */
  --text: #f2f2f7;           /* High contrast text */
  --text-dim: #98989f;       /* Dimmed shortcut label text */
  --panel-bg: rgba(40, 40, 42, 0.86); /* Translucent dark slate */
  --panel-border: rgba(255, 255, 255, 0.14);
}

.context-panel {
  position: fixed;
  min-width: 210px;
  padding: 5px;
  background: var(--panel-bg);
  
  /* Glassmorphism filters for macOS-grade blur */
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  
  border: 1px solid var(--panel-border);
  border-radius: 7px;
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.58);
  z-index: 10002; /* Float above desktop and windows */
}

/* Hidden by default, toggled via JS */
.context-panel[hidden] {
  display: none;
}

.context-panel-item {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 26px;
  padding: 5px 10px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--text);
  font-family: inherit;
  font-size: 13px;
  text-align: left;
  white-space: nowrap;
  cursor: default;
  outline: none;
}

/* Focused or hovered item gets native blue accent background */
.context-panel-item:hover,
.context-panel-item:focus-visible {
  background: var(--accent);
  color: #ffffff;
}

.context-panel-sep {
  height: 1px;
  margin: 5px 8px;
  background: rgba(255, 255, 255, 0.12);
}
```

---

## 4. JavaScript Controller (Positioning, Clamping & Lifecycle)

The controller coordinates pointer coordinates, handles collision calculations, and cleanly manages the event listeners lifecycle:

```javascript
const desktopEl = document.getElementById('desktop');
const desktopContextPanel = document.getElementById('desktop-context-panel');

// 1. Closes the panel safely
function closeDesktopContextPanel() {
  desktopContextPanel.hidden = true;
}

// 2. Dynamic positioning with viewport collision detection
function openDesktopContextPanel(x, y) {
  closeMenu();
  desktopContextPanel.hidden = false;

  // Query actual panel dimensions after unhiding to compute collision bounding box
  const panelRect = desktopContextPanel.getBoundingClientRect();
  const margin = 8; // Safety padding from the viewport edge

  // Collision detection math:
  // Math.min ensures the panel's right/bottom edge never bleeds off-screen.
  // Math.max guarantees the panel is never pushed off the left/top viewport margin.
  const left = Math.min(x, window.innerWidth - panelRect.width - margin);
  const top = Math.min(y, window.innerHeight - panelRect.height - margin);

  desktopContextPanel.style.left = `${Math.max(margin, left)}px`;
  desktopContextPanel.style.top = `${Math.max(margin, top)}px`;

  // Focus on the first item immediately so keyboard users start inside the menu
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

// 3. Event Listener: Native right-click interception on desktop area
desktopEl.addEventListener('contextmenu', (e) => {
  // Prevent default context panel from firing if right-clicking outside active windows
  if (e.target.closest('.window')) return;
  e.preventDefault();
  openDesktopContextPanel(e.clientX, e.clientY);
});

// 4. Event Listener: Action router
desktopContextPanel.addEventListener('click', (e) => {
  const item = e.target.closest('[data-context-action]');
  if (!item) return;

  closeDesktopContextPanel();

  // Distribute actions safely
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

// 5. Event Listener: Dismissal on click-outside
document.addEventListener('click', (e) => {
  closeMenu();
  if (!desktopContextPanel.contains(e.target)) {
    closeDesktopContextPanel();
  }
});

// 6. Event Listener: Dismissal on Escape key
document.addEventListener('keydown', (e) => {
  if (handleDesktopContextPanelKeydown(e)) return;

  if (e.key === 'Escape') {
    closeMenu();
    closeDesktopContextPanel();
  }
});
```

---

## 5. Performance Advantages of the Vortex OS Implementation

1. **Zero-Layout Thrashing on Positioning**: Positioning is calculated dynamically after unhiding, but avoids layout thrashing by reading `getBoundingClientRect()` inside a read-then-write sequence before the next paint pass.
2. **Roving Keyboard Focus**: Instantly focusing on the first `.context-panel-item` gives keyboard and assistive-technology users a predictable starting point. `ArrowDown` and `ArrowUp` cycle through menu items, while `Home` and `End` jump to the first and last actions.
3. **No Garbage Accumulation**: Event listeners are attached to persistent container elements (`desktopEl`, `document`) rather than being recreated and garbage-collected dynamically, guaranteeing zero memory leaks over long sessions.
