# Vortex OS - Storage Engine Instance Detection Design Specification

This document details the architectural design and implementation strategies required to incorporate **Same-Tab & Cross-Tab Instance Detection** inside the `CompressedStorageEngine` (`jsonl-storage-engine.js`) to prevent write collisions, database deadlocks, and transaction races.

---

## 1. The Hazard of Multiple Instances

When multiple instances of the storage engine are initialized against the same IndexedDB database name (`WebOSFileSystem`) simultaneously:
1. **Transaction Racing**: Two instances might read the same file chunks chunk array, append their respective data in memory, and write back, causing one write to overwrite and erase the other.
2. **Memory Cache Drift**: Pending in-memory debounced lines inside `pendingLines` of Instance A are completely invisible to Instance B, causing out-of-sync document reads.
3. **Database Version Deadlocks**: Version upgrade requests get blocked if old database handles in other instances fail to close.

---

## 2. Same-Tab Single-Instance Guard (Memory Registry)

For multiple initializations occurring within the **same browser tab/window context**, we can enforce a strict **Global Module Registry** using static scoping.

```
                  +--------------------------------+
                  |  jsonl-storage-engine.js Module|
                  |                                |
                  |  - const activeDatabases =     |
                  |    new Set();                  |
                  +────────────────┬───────────────+
                                   |
           ┌───────────────────────┴───────────────────────┐
           | init() called                                 |
           v                                               v
+──────────────────────────────────+             +──────────────────────────────────+
|  Check: is dbName in Set? (Yes)  |             |  Check: is dbName in Set? (No)   |
|                                  |             |                                  |
|  - Abort Initialization          |             |  - Add dbName to Set             |
|  - Throw: "Active DB exists"     |             |  - Open IndexedDB Connection     |
+──────────────────────────────────+             +──────────────────────────────────+
```

### The Architectural Rules:
- **Module-Level Isolation**: A private module-scoped `Set` (`activeDatabases`) tracks all active database connections in the current execution heap.
- **Initialization Check**: Before triggering `indexedDB.open()`, the engine verifies that the database name is not in the set. If it is, the connection attempt is aborted.
- **Teardown Deregistration**: When `close()` is called, the database name is removed from the module set, allowing safe re-initialization.

---

## 3. Cross-Tab Instance Detection (BroadcastChannel API)

To detect active storage engines running in **different browser tabs**, we utilize the browser-native `BroadcastChannel` API.

### The Handshake Protocol

For every database name, we establish a dedicated communication channel: `vortex-db-lock-${dbName}`.

1. **The HELO Ping**:
   - During `init()`, the new storage engine instance starts listening on the broadcast channel and broadcasts a `VFS_PING` message.
2. **The Response Window**:
   - The new instance waits for a short, non-blocking window (e.g., 80ms).
3. **Master Conflict Resolution**:
   - If an active storage engine is running in another tab, it intercepts `VFS_PING` and replies with `VFS_PONG`.
   - Upon receiving `VFS_PONG`, the new instance knows it is a duplicate. It can:
     - Throw an error to block startup.
     - Switch to a secure **Read-Only Mirror Mode** (中文解释: 只读镜像模式) and notify the user with a desktop toast.
   - If no `VFS_PONG` is received within the window, the instance declares itself the **Master Connection** and listens to reply `VFS_PONG` to any future `VFS_PING` requests.

---

## 4. IndexedDB Connection Lock Protection

Even with custom checks, we must bind the browser's native database event hooks to prevent system blocks:

- **`onversionchange` Listener**:
  - If another tab triggers a database version upgrade (e.g., database schema migration), this event fires on all active connections in other tabs.
  - *Action*: The engine must immediately call `db.close()` to unblock the upgrade and notify the user of a system restart.
- **`onblocked` Listener**:
  - If our connection is blocked because another tab has a stale unclosed database handle.
  - *Action*: Throw a clear, descriptive error: `"Database connection blocked by another tab. Please close other Vortex OS tabs to proceed."`
