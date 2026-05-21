# Vortex OS Terminal Runtime

## Runtime Model

`terminal.html` runs three terminal backends behind one xterm.js shell:

- WebContainer for `node`, `npm`, `npx`, and installed npm global binaries.
- Pyodide for `python`, `python3`, `pip`, and `pip3`.
- Optional v86 real-kernel mode behind the `linux` command when VM assets are installed.

The Vite dev server must send cross-origin isolation headers for WebContainer:

```http
Cross-Origin-Embedder-Policy: credentialless
Cross-Origin-Opener-Policy: same-origin
```

Those headers are configured in `vite.config.js` for both `server` and `preview`.

## Direct File Fallback

The full Terminal runtime is served through HTTP by Vite or the production build. Directly opening `terminal.html` with `file://` cannot resolve Vite bare imports such as `@xterm/xterm`, cannot activate the cross-origin isolation service worker, and cannot boot WebContainer or v86.

To keep the Terminal from rendering a blank screen in that mode, `terminal.html` now falls back to a small built-in terminal renderer and localStorage-backed file records. In direct-file mode:

- basic shell commands still load.
- `js <code>` runs browser JavaScript, not Node.js.
- `py <code>` can still boot Pyodide from the CDN when the browser allows it.
- `npm`, `npx`, WebContainer Node.js, and v86 Linux print an explicit HTTP-serving requirement instead of failing silently.

Use one of these commands for the full runtime:

```bash
npm run dev -- --host 127.0.0.1
npm run preview -- --host 127.0.0.1
```

## JavaScript REPL Input

The Terminal accepts both explicit JavaScript shorthands and REPL-style JavaScript statements:

```text
js console.log("hello")
console.log("hello");
Math.max(3, 9);
```

REPL-style JavaScript is detected before the unknown-command path. In HTTP mode it runs through WebContainer Node.js; in direct-file fallback mode it runs through browser JavaScript. Expression results are printed when the evaluated value is not `undefined`.

Arrow-key escape sequences such as left arrow (`ESC [ D`) are filtered in shell mode so they do not become literal `[D` text in the command buffer.

## Shell Line Editing

The shell input layer implements a small terminal-style line editor before dispatching commands:

- Left / Right moves the cursor inside the current line.
- Backspace deletes before the cursor.
- Delete deletes at the cursor.
- Up / Down recalls command history.
- Home / End and Ctrl+A / Ctrl+E jump to the start or end of the line.
- Tab completes command names when there is a single match and lists matches when ambiguous.
- Ctrl+C clears the current input and prints a fresh prompt.

This editor runs only in Vortex shell mode. When a WebContainer process or v86 Linux VM owns the terminal, key data is forwarded to that runtime.

## npm Global Installs

WebContainer does not allow writes to `/usr/local/lib/node_modules`, so commands such as:

```bash
npm i -g @openai/codex
```

are routed to a writable browser runtime prefix:

```text
/home/.npm-global
```

The terminal app appends `--prefix /home/.npm-global` only when an `npm` command includes `-g` or `--global` and the user did not already provide a prefix. It also sets:

- `HOME=/home`
- `PATH=/home/.npm-global/bin:/usr/local/bin:/usr/bin:/bin`
- `npm_config_cache=/home/.npm`
- `npm_config_prefix=/home/.npm-global`

This fixes the EACCES failure mode where npm tries to create directories under `/usr/local`.

After a global install, Vortex shell also dispatches unknown safe executable names through WebContainer. It first tries:

```text
/home/.npm-global/bin/<command>
```

and then falls back to WebContainer PATH lookup. This is required for commands such as:

```bash
npm i -g @openai/codex
codex --version
```

Without this dispatch path the package can install successfully while Vortex shell still prints `codex: command not found`.

## Codex CLI Limitation

`@openai/codex` can be installed by npm inside WebContainer, but the current package launches a native Linux ELF binary for the interactive CLI/TUI. Browser WebContainer can run Node/npm packages, but it cannot execute native Linux binaries as full OS processes.

For that reason, the Vortex shell intercepts `codex` and prints a compatibility message instead of letting the native launcher fall through to a cryptic `jsh: command not found: Cannot` / exit 127 failure. If `@openai/codex` was installed in the current WebContainer session, `codex --version` reports the installed npm package version before printing the runtime limitation. Run Codex from the host terminal instead:

```bash
npm i -g @openai/codex
codex
```

## Pyodide Build Behavior

Pyodide is loaded at runtime from the official CDN module URL instead of being statically bundled by Vite. This keeps the production build free of Pyodide's Node compatibility externalization warnings while preserving the terminal's Python runtime.

## v86 Linux Mode

The `linux` command boots a real Linux kernel through v86 in a Web Worker. VM assets are served from `public/v86/` so the browser does not depend on remote hotlink or CORS behavior at boot time:

- `libv86.js`
- `v86.wasm`
- `v86-fallback.wasm`
- `seabios.bin`
- `vgabios.bin`
- `buildroot-bzimage68.bin`
- `alpine-initramfs.cpio.gz` for the optional Alpine profile

Available VM commands:

```text
linux
linux buildroot
linux alpine
linux help
```

### Buildroot Profile

The default `linux` / `linux buildroot` profile uses the official v86 Buildroot kernel image. It is useful for proving real-kernel serial boot, but it is not Alpine and is not a package-install workstation.

Known missing tools in the default Buildroot image:

- `bash`
- `apk`, `apt`, or another package manager
- `node`
- `python3`
- HTTPS-capable `curl`

Commands such as the following are expected to fail in the default VM:

```sh
curl -fsSL https://claude.ai/install.sh | bash
```

The observed failure is:

```text
-/bin/sh: bash: not found
curl: (1) Protocol "https" not supported
```

This is an image capability limit, not a v86 boot failure. Use WebContainer for Node/npm and Pyodide for Python/pip, or use the Alpine profile for an `apk`-based Linux userspace.

### Alpine Profile

The `linux alpine` profile boots the same v86 kernel with a locally generated Alpine initramfs:

```text
public/v86/alpine-initramfs.cpio.gz
```

The initramfs is built from the official Alpine x86 minirootfs:

```text
https://dl-cdn.alpinelinux.org/alpine/latest-stable/releases/x86/alpine-minirootfs-3.23.0-x86.tar.gz
```

Build or refresh the asset with:

```bash
./scripts/build-alpine-initramfs.sh
```

Current generated artifact:

- Size: 6.6 MiB
- SHA-256: `74bde06bb99942c2f03d6121e3629dd2d74abe2ef25f41f4bdb0117217f05ca4`

The build script preinstalls:

- `bash`
- `curl`
- `ca-certificates`
- Alpine `apk`
- the required shared-library dependencies for those packages

The profile enables v86's built-in `fetch` network relay:

```js
network_relay_url: 'fetch'
```

That relay provides guest DHCP/DNS and browser-backed HTTP fetches. The Alpine init script runs `udhcpc` and falls back to the relay's static network (`192.168.86.100/24`, gateway `192.168.86.1`) if no lease is present. Direct guest HTTPS/TCP egress still requires a WISP/full TCP relay, because the fetch relay does not tunnel arbitrary port 443 connections.

The build script also creates a same-origin APK mirror under:

```text
public/v86/apk/main/x86/
```

`terminal.html` rewrites `/etc/apk/repositories` after Alpine reaches its shell prompt. On localhost it uses v86's `port.external` mapping, including the Vite base path:

```text
http://<current-port>.external/<base-path>/v86/apk/main
```

For local preview URLs such as `http://127.0.0.1:4173`, Vortex also appends the matching `<port>.external` host alias to `/etc/hosts` and the raw APK mirror middleware sends `Access-Control-Allow-Origin: *`. This keeps v86's internal `localhost:<port>` fetch compatible with both `localhost` and `127.0.0.1` page origins.

On deployed hosts such as GitHub Pages it uses the current host and base path:

```text
http://<current-host>/<base-path>/v86/apk/main
```

The v86 fetch relay upgrades those browser fetches to HTTPS when the page itself is loaded over HTTPS. The relay runs inside `v86-worker.js`, so the worker exposes `self` as `window` before loading v86; this lets v86's fetch relay read `location.protocol` and avoid mixed-content HTTP fetches on GitHub Pages. Vite serves that mirror through a raw-file middleware in development so `APKINDEX.tar.gz` and `.apk` files are not browser-decompressed before v86 relays them to the guest. GitHub Pages serves the same static files from `dist/v86/apk/main/x86/`.

### GitHub Pages Deployment

The GitHub Actions workflow in `.github/workflows/deploy.yml` installs dependencies, runs `npm run build`, uploads `dist`, and deploys it with `actions/deploy-pages`.

Production Terminal support depends on these build outputs:

- `terminal.html` and its bundled `assets/terminal-*.js`
- `assets/v86-worker-*.js`
- `v86/libv86.js`
- `v86/v86.wasm`
- `v86/buildroot-bzimage68.bin`
- `v86/alpine-initramfs.cpio.gz`
- `v86/apk/main/x86/*`

The v86 worker must be created with Vite's tracked worker URL pattern. A plain string such as `new Worker('v86-worker.js')` works in the dev server but is not emitted into `dist`, causing GitHub Pages to request `/Web-OS/v86-worker.js` and fail with `Worker crashed`. The production build now emits `assets/v86-worker-*.js`.

Inside the VM, bring up networking with:

```sh
udhcpc -i eth0
apk update
```

For a full TCP relay, boot Alpine with an explicitly provided WISP endpoint:

```text
linux alpine wisp://host:port
linux alpine wisps://host:port
```

The client-side v86 wiring accepts those relay URLs, but Vortex OS does not require or launch a localhost Node.js relay. The frontend runtime must remain browser-first: static assets, WebContainer/Pyodide, v86 fetch relay, and the same-origin APK mirror. A WISP server is an optional external infrastructure service, not part of the default frontend Web OS runtime.

If `linux alpine` reports a missing initramfs asset, run the build script above.

## Verification

Verified on 2026-05-20 with Chrome DevTools MCP against `http://localhost:5176/`:

- Host and terminal iframe reported `crossOriginIsolated === true`.
- `npm config get prefix` returned `/home/.npm-global`.
- `npm i -g @openai/codex` normalizes to `npm i -g @openai/codex --prefix /home/.npm-global`.
- `npm i -g cowsay` followed by `cowsay hello` executed the installed global binary instead of printing `command not found`.
- `codex` is intercepted with a WebContainer native-binary compatibility message and no longer prints `jsh: command not found: Cannot` or exits with code 127.
- `linux` booted v86 to a serial shell and `uname -a` returned `Linux (none) 6.8.12 ... i686 GNU/Linux`.
- The default Buildroot VM returned `python3: not found`, `node: not found`, `apk: not found`, `bash: not found`, and `curl: (1) Protocol "https" not supported`.
- Terminal `help` now states that full bash/HTTPS/package installs require a prepared Alpine/Debian disk image.
- `npm run build` completed without Pyodide externalization warnings.

Verified on 2026-05-21:

- `./scripts/build-alpine-initramfs.sh` downloaded the official Alpine minirootfs and generated `public/v86/alpine-initramfs.cpio.gz`.
- `linux help` documents the Buildroot and Alpine profiles separately.
- Chrome DevTools MCP confirmed `linux alpine` boots to `/ #`, reports Alpine `3.23.0`, and exposes `/sbin/apk`.
- Chrome DevTools MCP confirmed `bash --version` returns GNU bash `5.3.3`.
- Chrome DevTools MCP confirmed `curl --version` returns curl `8.19.0` with `https` protocol support and OpenSSL `3.5.6`.
- Chrome DevTools MCP confirmed v86 fetch relay DHCP assigns `192.168.86.100` to `eth0`.
- Chrome DevTools MCP confirmed the dynamic same-origin mirror rewrites `/etc/apk/repositories` to the active dev port, adds the local `<port>.external` host alias, and `apk update` returns `OK: 5869 distinct packages available`.
- Chrome DevTools MCP confirmed direct `file://` Terminal mode no longer renders blank, has no console errors, runs `js console.log(22)` through browser JavaScript, and prints a clear HTTP-serving requirement for `npm`.
- Chrome DevTools MCP confirmed HTTP preview Terminal still runs Pyodide Python and WebContainer Node.js after the fallback change.
- Chrome DevTools MCP confirmed HTTP preview Terminal runs direct REPL-style `console.log("test");` and `Math.max(3, 9);`, filters left-arrow escape input without leaking `[D`, and reports unknown commands as shell-level `command not found` without WebContainer `jsh` noise.
- Chrome DevTools MCP confirmed shell line editing supports cursor movement, Delete, command history recall, command-name Tab completion, Ctrl+A/Ctrl+E, and no arrow escape leakage.
