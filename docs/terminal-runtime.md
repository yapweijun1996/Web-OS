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

- Size: 3.4 MiB
- SHA-256: `af6584538b34146e0048fc1c0b22d632d08b271ef5c306a4bc57a66eb03f201c`

The profile documents `/bin/sh` (BusyBox ash) as the default shell and includes Alpine `apk` from the minirootfs. Because this is a compact initramfs rather than a full workstation disk image, `bash`, `curl`, and CA certificates are installed through `apk` after the VM has network egress:

```sh
udhcpc -i eth0
apk update
apk add bash curl ca-certificates
```

If `linux alpine` reports a missing initramfs asset, run the build script above. If `apk update` cannot reach mirrors, the VM booted correctly but v86 networking still needs a prepared network path or a fuller Alpine/Debian disk image.

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
