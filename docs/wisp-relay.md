# WISP Relay — Optional External Infrastructure

This document clarifies the role of WISP in Vortex OS and confirms that the
default runtime is frontend-only and requires no localhost server.

---

## Default Runtime (frontend-only, no server required)

Vortex OS runs entirely in the browser. The terminal's Alpine Linux environment
uses two mechanisms that need no external process:

| Mechanism | What it does | Where it lives |
|---|---|---|
| **v86 fetch relay** | Routes guest HTTP/HTTPS requests through the browser's `fetch()` API | Built into `v86-worker.js`; enabled by default |
| **Same-origin APK mirror** | Serves Alpine packages from `apk/` in the same GitHub Pages origin | Static files in the repo; no server needed |

**`apk add` and `curl http://…` work out of the box** because the fetch relay
intercepts all guest network calls and forwards them through the browser. No
Node.js daemon, no localhost port, no extra setup is required.

---

## WISP — Optional Explicit Relay Mode

[WISP](https://github.com/MercuryWorkshop/wisp-protocol) is a WebSocket-based
multiplexing protocol that lets the v86 guest establish raw TCP connections
through an external relay server. It enables direct guest TCP/TLS, which the
browser's `fetch()` relay cannot provide (fetch can only handle HTTP/HTTPS, not
arbitrary TCP).

### When WISP is useful

- Direct TCP connections inside the guest (e.g., `ssh`, `git clone` over TCP,
  non-HTTP protocols)
- Scenarios where the guest needs full TCP access beyond what `fetch()` can proxy

### How to use WISP in Vortex terminal

Pass a WISP endpoint as a flag when launching Alpine:

```
linux alpine wisp://your-relay.example.com/
linux alpine wisps://your-relay.example.com/   # TLS endpoint
```

WISP is **not the default** and is **not required** for normal use. The
`linux alpine` command with no flags uses the fetch relay.

---

## Hosting a WISP Relay (external infrastructure)

A WISP relay is a WebSocket server that proxies raw TCP connections. It is **not
part of Vortex OS** — it is external operator infrastructure.

Reference implementations:

| Project | Language | Notes |
|---|---|---|
| [wisp-server-node](https://github.com/MercuryWorkshop/wisp-server-node) | Node.js | Reference server |
| [epoxy-tls](https://github.com/MercuryWorkshop/epoxy-tls) | Rust | High-performance option |

To deploy, run the relay on any HTTPS-capable host and pass its URL to the
terminal as shown above. The relay must be reachable from the user's browser
(correct CORS headers, valid TLS certificate for `wisps://`).

**Vortex OS itself never contacts the relay** — the v86 WebAssembly worker
establishes the WebSocket connection directly from the user's browser to the
relay endpoint.

---

## Summary

| Mode | Command | Server needed? | Use case |
|---|---|---|---|
| Default | `linux alpine` | ❌ None | General package install, curl HTTP/HTTPS |
| WISP | `linux alpine wisp://…` | ✅ External relay | Raw TCP, non-HTTP protocols |
| WISPS | `linux alpine wisps://…` | ✅ External relay (TLS) | Raw TCP over TLS |

The default experience is fully frontend-only. WISP is opt-in external
infrastructure for advanced TCP use cases.
