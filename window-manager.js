// window-manager.js — the Window Management System (WMS).
//
// Owns every open window: the active-windows array, z-index allocation, focus
// tracking, minimize-to-Dock, maximize, and drag. Both of index.html's window
// openers funnel through the single open() path — a caller only customizes how
// the window body is filled.

class WindowManager {
  // `desktop` is the element new windows are appended to; `dock` receives the
  // tiles minimized windows collapse into. Both are injected, not looked up.
  constructor({ desktop, dock }) {
    this.desktop = desktop;
    this.dock = dock;
    this.windows = [];   // open window nodes (incl. minimized), creation order
    this._zIndex = 10;
  }

  // Open a window. `fillBody(bodyEl)` populates the window body; if it returns
  // a function, that function runs on close (e.g. to tear down a plugin
  // harness). Returns the window element.
  open({ title, fillBody }) {
    const win = document.createElement('div');
    win.className = 'window';
    win.style.zIndex = this._nextZIndex();

    // Cascade each new window 30px down-right of the last, wrapping every 5.
    const step = (this.windows.length % 5) * 30;
    const offsetX = 60 + step;
    const offsetY = 60 + step;
    win.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0)`;

    const { header, closeBtn, minBtn, maxBtn } = this._buildChrome(title);

    const body = document.createElement('div');
    body.className = 'window-body';
    win.append(header, body);
    this.desktop.appendChild(win);

    // The body is in the DOM before fillBody runs, so iframes load reliably.
    const cleanup = fillBody(body);

    closeBtn.addEventListener('click', () => this._close(win, cleanup));
    minBtn.addEventListener('click', () => this.minimize(win));
    maxBtn.addEventListener('click', () => this.toggleMaximize(win));
    win.addEventListener('pointerdown', () => {
      win.style.zIndex = this._nextZIndex();
      this.focus(win);
    });

    this._setupDragging(win, header, offsetX, offsetY);
    this.windows.push(win);
    this.focus(win);
    return win;
  }

  // Mark `win` as the frontmost window; only it shows full-color chrome.
  focus(win) {
    this.windows.forEach(w => w.classList.remove('focused'));
    win.classList.add('focused');
  }

  // Minimize `win` into the Dock. The window stays in `this.windows` (it is
  // still open, just hidden); a Dock tile restores and re-focuses it.
  minimize(win) {
    if (win.style.display === 'none') return;
    const title = win.querySelector('.window-title').textContent;
    win.style.display = 'none';
    win.classList.remove('focused');

    const tile = document.createElement('div');
    tile.className = 'dock-app dock-min-tile';
    tile.title = title;
    tile.textContent = '🪟';
    tile.addEventListener('click', () => {
      win.style.display = '';
      tile.remove();
      win.style.zIndex = this._nextZIndex();
      this.focus(win);
    });
    this.dock.appendChild(tile);
    this._focusTop();
  }

  // Toggle `win` between its geometry and filling the desktop. Pre-maximize
  // geometry is stashed on the element so restore is exact.
  toggleMaximize(win) {
    if (win.classList.contains('maximized')) {
      const s = win._restoreState || {};
      win.style.transform = s.transform || 'translate3d(60px, 60px, 0)';
      win.style.width = s.width || '';
      win.style.height = s.height || '';
      win.classList.remove('maximized');
    } else {
      win._restoreState = {
        transform: win.style.transform,
        width: win.style.width,
        height: win.style.height
      };
      win.style.transform = 'translate3d(0px, 0px, 0)';
      win.style.width = '100%';
      win.style.height = '100%';
      win.classList.add('maximized');
    }
  }

  // Allocate the next stacking z-index. Resets all windows to a low sequential
  // band before the counter approaches the CSS safe ceiling.
  _nextZIndex() {
    if (this._zIndex >= 9000) {
      this.windows.forEach((w, i) => { w.style.zIndex = 10 + i; });
      this._zIndex = 10 + this.windows.length - 1;
    }
    return ++this._zIndex;
  }

  // Hand focus to the topmost still-visible window (after a close/minimize).
  _focusTop() {
    const visible = this.windows.filter(w => w.style.display !== 'none');
    if (!visible.length) return;
    const top = visible.reduce((a, b) =>
      (Number(b.style.zIndex) || 0) > (Number(a.style.zIndex) || 0) ? b : a);
    this.focus(top);
  }

  // Close `win`: run its cleanup, drop it from the DOM and the active array,
  // then re-focus whatever is now on top. Every close path routes through here
  // so `this.windows` never holds a detached node.
  _close(win, cleanup) {
    if (typeof cleanup === 'function') cleanup();
    win.remove();
    const i = this.windows.indexOf(win);
    if (i !== -1) this.windows.splice(i, 1);
    this._focusTop();
  }

  // Build the window chrome (header + traffic-light buttons) with DOM APIs so
  // the title is assigned via textContent — never innerHTML — blocking XSS
  // from plugin manifest metadata. Controls render close, minimize, maximize.
  _buildChrome(titleText) {
    const header = document.createElement('div');
    header.className = 'window-header';

    const titleEl = document.createElement('div');
    titleEl.className = 'window-title';
    titleEl.textContent = titleText;

    const controls = document.createElement('div');
    controls.className = 'window-controls';

    ['win-close', 'win-min', 'win-max'].forEach(cls => {
      const btn = document.createElement('button');
      btn.className = `win-btn ${cls}`;
      controls.appendChild(btn);
    });

    header.append(controls, titleEl);
    return {
      header,
      closeBtn: controls.querySelector('.win-close'),
      minBtn: controls.querySelector('.win-min'),
      maxBtn: controls.querySelector('.win-max')
    };
  }

  // GPU-accelerated drag: mutate only `transform` so the compositor moves the
  // window without triggering layout reflow. Disabled while maximized.
  _setupDragging(win, header, initialX, initialY) {
    let isDragging = false;
    let startX, startY;
    let currentX = initialX, currentY = initialY;

    header.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      // A pointerdown on a traffic-light button must not start a drag — and
      // must not capture the pointer, or the button never receives its click.
      if (e.target.closest('.window-controls')) return;
      if (win.classList.contains('maximized')) return;
      isDragging = true;
      startX = e.clientX - currentX;
      startY = e.clientY - currentY;
      header.setPointerCapture(e.pointerId);
    });

    header.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      currentX = e.clientX - startX;
      currentY = e.clientY - startY;
      win.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
    });

    header.addEventListener('pointerup', (e) => {
      isDragging = false;
      header.releasePointerCapture(e.pointerId);
    });
  }

  // Get active process performance telemetry metrics for the Resource Monitor (VORTEX-107).
  // Returns real-time metrics for each active window. Handles cross-origin SOP errors gracefully.
  getProcessTelemetry() {
    return this.windows.map((win, index) => {
      const title = win.querySelector('.window-title')?.textContent || 'Unknown';
      const isFocused = win.classList.contains('focused');
      const isMinimized = win.style.display === 'none';
      const iframe = win.querySelector('iframe');
      
      let domCount = 0;
      let isCrossOrigin = false;
      
      if (iframe) {
        try {
          const doc = iframe.contentDocument || iframe.contentWindow?.document;
          if (doc) {
            domCount = doc.getElementsByTagName('*').length;
          } else {
            isCrossOrigin = true;
          }
        } catch (e) {
          isCrossOrigin = true;
        }
      }
      
      return {
        id: win.id || `win-${index}-${title.replace(/\s+/g, '-').toLowerCase()}`,
        title,
        isFocused,
        isMinimized,
        domCount,
        isCrossOrigin,
        ipcRate: win._ipcCount || 0
      };
    });
  }
}

export { WindowManager };
