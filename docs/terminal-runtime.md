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

## Pyodide Build Behavior

Pyodide is loaded at runtime from the official CDN module URL instead of being statically bundled by Vite. This keeps the production build free of Pyodide's Node compatibility externalization warnings while preserving the terminal's Python runtime.

## v86 Linux Mode

The `linux` command boots a real Linux kernel through v86 in a Web Worker. Default VM assets are served from `public/v86/` so the browser does not depend on remote hotlink or CORS behavior at boot time:

- `libv86.js`
- `v86.wasm`
- `v86-fallback.wasm`
- `seabios.bin`
- `vgabios.bin`
- `buildroot-bzimage68.bin`

The default image is the official v86 Buildroot kernel image. It is useful for proving real-kernel serial boot, but it is not Alpine and does not include `apk`, `node`, or `python3`. To support package-manager installs inside the VM, add a prepared Alpine or Debian disk image and pass it as `hdaUrl` or `cdromUrl` through `V86LinuxBridge`.

## Verification

Verified on 2026-05-20 with Chrome DevTools MCP against `http://localhost:5176/`:

- Host and terminal iframe reported `crossOriginIsolated === true`.
- `npm config get prefix` returned `/home/.npm-global`.
- `npm i -g @openai/codex` normalizes to `npm i -g @openai/codex --prefix /home/.npm-global`.
- `npm i -g cowsay` followed by `cowsay hello` executed the installed global binary instead of printing `command not found`.
- `npm i -g @openai/codex` followed by `codex --version` executed the installed binary instead of printing `command not found`; observed output was `jsh 1.0 (x64-linux)`.
- `linux` booted v86 to a serial shell and `uname -a` returned `Linux (none) 6.8.12 ... i686 GNU/Linux`.
- The default Buildroot VM returned `python3: not found`, `node: not found`, and `apk: not found`.
- `npm run build` completed without Pyodide externalization warnings.
