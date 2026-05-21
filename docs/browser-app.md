# Vortex OS Browser App

## Runtime Model

`browser.html` is a first-party system app for quick web navigation inside Vortex OS. It provides:

- an address/search bar
- Back, Forward, Reload, Home, and Open in New Tab controls
- default website suggestions
- per-bookmark Embed or Tab mode
- custom bookmark add/delete stored in browser local storage

The Vite multi-page build emits `dist/browser.html`, and the app can be opened from the Dock or the desktop context menu.

## Default Bookmarks

Default suggestions are intentionally small and editable at runtime:

- Yap Wei Jun: `https://yapweijun1996.com/`
- GitHub Pages: `https://yapweijun1996.github.io/Web-OS/`
- GitHub Profile: `https://github.com/yapweijun1996`
- GitHub: `https://github.com/`
- OpenAI: `https://openai.com/`
- ChatGPT: `https://chatgpt.com/`
- MDN Web Docs: `https://developer.mozilla.org/`
- npm: `https://www.npmjs.com/`
- Vercel: `https://vercel.com/`

## Embed And Tab Modes

Browser suggestions can open in two modes:

- **Embed** loads the target URL inside the app iframe.
- **Tab** opens the target in a normal browser tab and shows an external-tab panel in Vortex OS.

The Yap Wei Jun site and Yap Wei Jun GitHub Pages site are controlled first-party embed targets. They keep their own iframe origin so CSS, JavaScript modules, and service-worker checks can run normally inside WebOS.

External-only defaults, including GitHub, OpenAI, ChatGPT, Google, and Vercel, start in Tab mode to avoid blank frames and sandbox/CORS console noise.

Modes are persisted in:

```text
localStorage.vortex_browser_site_modes
```

Custom bookmarks are persisted in:

```text
localStorage.vortex_browser_custom_sites
```

Custom bookmark URLs are normalized so bare domains such as `example.com` become `https://example.com`, while non-domain search text becomes a Google search URL.

## Iframe Security Limits

The Browser app is still a frontend web app, not a native browser engine. Some websites cannot be displayed inside the Web OS iframe because the remote site sends browser-enforced anti-framing headers.

Known external-only hosts include:

- `github.com`
- `openai.com`
- `chatgpt.com`
- `google.com`
- `vercel.com`

For example, `https://github.com/yapweijun1996` cannot open inside the Web OS iframe because GitHub sends `X-Frame-Options: deny` and a Content Security Policy with `frame-ancestors 'none'`. Other modern sites may load as a sandboxed opaque origin and then fail their own CORS, module-script, or service-worker assumptions. Chrome enforces these limits before app JavaScript can render the page. This is expected browser security behavior.

When a blocked site is opened in Embed mode, Vortex OS shows an "Embedding blocked by this website" panel with an Open Site action instead of leaving a blank iframe.

## Verification

Use this checklist after Browser app changes:

```bash
npm run build
npm run dev -- --port 5182 --host 127.0.0.1
```

Then verify in Chrome DevTools MCP:

- `browser.html` loads and starts at `https://yapweijun1996.com/`.
- default suggestions render with expected Embed/Tab modes.
- a custom bookmark can be added, switched to Tab mode, persisted, and deleted.
- GitHub Profile in Embed mode shows the blocked-embedding panel.
- the console has no app-blocking uncaught exceptions.
