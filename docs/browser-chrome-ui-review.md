# Browser App Chrome UI/UX Review

Review date: 2026-05-21  
Target: `browser.html` production preview at `http://127.0.0.1:4177/Web-OS/browser.html?qa=chrome-ui-review`

## Chrome-Like Baseline

This review uses observable Chrome/Chromium browser conventions as the target interaction model:

- A browser toolbar should stay focused on high-use tab actions and avoid clutter. Chromium's toolbar guidance lists Back, Forward, Reload, optional Home, address bar / omnibox, bookmark, and menu as core toolbar concepts.
- Chrome Help documents toolbar controls as actions that live next to the address bar and may open a side panel, tab, or bubble.
- Chrome's address bar is the primary search and navigation entry point; it should support URL entry and search without requiring a separate Go button for normal keyboard use.
- The new-tab surface should not permanently consume the browsing viewport after a page is loaded.

References:

- Chromium Toolbar: `https://chromium.googlesource.com/playground/chromium-org-site/+/refs/heads/main/user-experience/toolbar.md`
- Chrome toolbar customization: `https://support.google.com/chrome/answer/14835450`
- Chrome address-bar search: `https://support.google.com/chrome/answer/95440`

## Tested States

- Desktop viewport: `1280x800`
- Mobile viewport: `390x844` emulation through Chrome DevTools MCP
- Default embedded page: `https://yapweijun1996.com/`
- External-only page: `https://github.com/yapweijun1996`
- Console inspection after desktop external-panel test

Screenshots captured locally:

- `.codex/browser-review-desktop.png`
- `.codex/browser-review-mobile.png`

## Findings

### P0: Mobile Layout Leaves Almost No Page Viewport

Evidence:

- At the mobile review viewport, the suggestions region measured about `658.5px` high.
- The actual iframe content region measured about `26.5px` high.
- `body` uses `overflow: hidden`, and no independent scroll container was present for suggestions.

Impact:

- The primary user task, browsing a website, is effectively blocked on small screens.
- This diverges from Chrome's model where controls remain compact and page content owns the viewport after navigation.

Recommended fix:

- Collapse suggestions into a new-tab surface shown only for blank/new-tab state.
- After navigation, hide the suggestions surface and make the iframe content fill the remaining viewport.
- On mobile, expose bookmarks through an overflow menu or bottom sheet, not an always-visible grid.

### P1: No Tab Strip Or Tab Model

Evidence:

- The UI has one iframe, one history stack, and one address field.
- There are no visible tabs, active-tab affordance, tab close action, or new-tab button.

Impact:

- The app reads as a web launcher, not a browser.
- Users cannot keep multiple pages open, switch context, or recover from an accidental navigation the way they expect in Chrome.

Recommended fix:

- Add a compact tab strip above the toolbar.
- Each tab should track title, URL, mode, loading state, and close state.
- Add a `+` new-tab button and keep the address bar scoped to the active tab.

### P1: Suggestions And Bookmark Editor Are Always Visible

Evidence:

- Desktop suggestions measured about `290px` tall in a `733px` viewport, leaving only `395px` for content.
- The bookmark editor is permanently shown at the top of suggestions.

Impact:

- Chrome-like browsers separate a new-tab shortcuts surface from the loaded page viewport.
- Permanent editing controls compete with browsing content and increase visual noise.

Recommended fix:

- Move custom bookmark creation into a dialog, side panel, or menu action.
- Keep shortcuts on a new-tab page only.
- Use a small bookmarks bar or overflow list for persistent shortcuts.

### P1: Toolbar Is Not Chrome-Like Enough

Evidence:

- Toolbar has Back, Forward, Reload, Home, Go, and Open New Tab, but no tab strip, no overflow/menu button, no bookmark/star action, and no loading/stop state.
- The `Go` button is always visible even though Chrome-style navigation primarily uses Enter in the address bar.

Impact:

- The toolbar is functionally useful but does not match Chrome's control hierarchy.

Recommended fix:

- Use icon-only controls for Back, Forward, Reload/Stop, Home, Bookmark, Open External, and More.
- Make Enter the primary navigation path; keep Go optional or fold it into the omnibox trailing action.
- Add loading feedback in the tab or omnibox.

### P2: Embed/Tab Mode Controls Are Too Prominent

Evidence:

- Every suggestion card contains `Embed` and `Tab` buttons.
- These controls repeat nine times and dominate the shortcuts grid.

Impact:

- Mode selection is a technical configuration, not a primary browsing action.
- It makes the UI feel like a settings tool instead of Chrome-style browser UI.

Recommended fix:

- Move mode selection to a per-bookmark edit menu.
- Show a subtle badge only when a site is external-only or currently set to open in a real browser tab.

### P2: External-Only Panel Needs Browser Recovery Actions

Evidence:

- GitHub Profile opens an external panel correctly.
- The panel only offers `Open Site`.

Impact:

- Users can open externally, but cannot quickly switch the bookmark back to Tab/Embed, copy the URL, or learn why a site is blocked in a concise browser-style message.

Recommended fix:

- Add `Open in Tab`, `Copy URL`, and `Back to New Tab` actions.
- Keep the technical explanation expandable or secondary.

### P2: Accessibility And Control Semantics Need Tightening

Evidence:

- Mode buttons use `aria-pressed`, but their accessible names are only `Embed` / `Tab`, repeated for every site.
- `Go`, `Add`, and `Open Site` do not have explicit `aria-label` values.
- Console reported a form-field id/name issue inside embedded content; no blocking app error was found.

Impact:

- Keyboard and screen-reader users cannot easily identify which bookmark mode button they are changing.

Recommended fix:

- Give mode controls labels such as `Set GitHub Pages to Embed`.
- Add labels for primary actions.
- Verify tab order across toolbar, tab strip, shortcuts, external panel, and iframe boundary.

## Prioritized Backlog

1. Rebuild Browser app shell around Chrome-like `tab strip -> toolbar/omnibox -> content viewport`.
2. Move suggestions into a New Tab page and hide it after navigation.
3. Convert bookmark editing and Embed/Tab settings into overflow menus or dialogs.
4. Add external-only recovery actions and clearer non-technical messaging.
5. Re-test desktop and mobile viewport layout with Chrome DevTools MCP.

## Acceptance Gate For Redesign

- Desktop content viewport remains at least 70% of available height after a page loads.
- Mobile content viewport remains at least 65% of available height after a page loads.
- The app has a visible tab strip with active tab, close tab, and new tab controls.
- The omnibox is the primary URL/search control and supports Enter-to-navigate.
- New-tab shortcuts are visible only on new-tab/blank state or via an explicit bookmarks action.
- Console contains no app-blocking errors after loading an embeddable site and an external-only site.

## VORTEX-131 Implementation Notes

Implemented on 2026-05-21:

- Replaced the launcher-style always-visible suggestions layout with a Chrome-like shell: tab strip, compact toolbar, omnibox, and content viewport.
- Added active tab, close tab, and new tab controls.
- Moved default suggestions into the New Tab surface only.
- Moved custom bookmark creation into the Browser menu.
- Moved per-bookmark Embed/Tab controls into a settings dialog opened from each shortcut card.
- Added external-only recovery actions: Open in Tab, Copy URL, and Back to New Tab.

Post-change Chrome DevTools MCP checks:

- Desktop loaded-page content viewport measured `713px` of `800px`, about `89.1%`.
- Mobile loaded-page content viewport measured `762px` of `844px`, about `90.3%`.
- New Tab surface measured the full workspace height and rendered all `9` default shortcuts.
- External-only GitHub Profile panel rendered Open in Tab, Copy URL, and Back to New Tab actions.
- Custom bookmark add, Tab-mode persistence, delete, and mode cleanup were verified through the Browser menu and settings dialog.
