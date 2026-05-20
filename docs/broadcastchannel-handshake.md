# Vortex OS - BroadcastChannel Handshake Implementation Specification

This document details the actual class method designs, message event cycles, and promise-based flow control needed to implement the BroadcastChannel PING-PONG handshake inside the `CompressedStorageEngine` (`jsonl-storage-engine.js`).

---

## 1. The Async Initialization Pipeline with Master/Mirror Fork

The `init()` method of the storage engine acts as the primary lifecycle controller. By executing a **Pre-flight Handshake Block** (中文解释: 预检握手阻塞)，it determines whether to proceed as an active Master or fork into a Read-Only Mirror.

```
                  +--------------------------------+
                  |     init() Lifecycle Start     |
                  +────────────────┬───────────────+
                                   |
                  Call: await _establishTabLock()
                                   |
           ┌───────────────────────┴───────────────────────┐
           |                                               |
           v (Returned: true - No conflict)                v (Returned: false - Conflict)
+──────────────────────────────────+             +──────────────────────────────────+
|  this.readOnly = false;          |             |  this.readOnly = true;           |
|                                  |             |  Console.warn("Switch to Mirror")|
+──────────────────────────────────+             +──────────────────────────────────+
           |                                               |
           └───────────────────────┬───────────────────────┘
                                   v
                      Open IndexedDB Connection
```

---

## 2. Handshake Mechanics (`_establishTabLock`)

This private method encapsulates the asynchronous PING-PONG message cycle using a short, non-blocking `Promise` timer window.

### Mathematical & Logical Flow

1. **Establish Channel**:
   - Instantiate `new BroadcastChannel('vortex-db-lock-' + this.dbName)`.
2. **Listen**:
   - Register the `onmessage` listener.
   - If an incoming message is `VFS_PING`:
     - If our connection is already open and `this.readOnly === false`, we are the active Master! Broadcast `VFS_PONG` immediately to assert ownership.
   - If an incoming message is `VFS_PONG`:
     - Flag a boolean variable: `hasMasterConflict = true`.
3. **Probe**:
   - Broadcast `VFS_PING` on the channel to probe other tabs.
4. **Decide (The 80ms Race Window)**:
   - Set an 80ms timeout.
   - Once the timeout resolves:
     - If `hasMasterConflict` is `true`, resolve the promise with `false` (we must run as a Read-Only Mirror).
     - If `hasMasterConflict` is `false`, resolve the promise with `true` (we are the Master).

---

## 3. Class Integration Contracts (Pseudocode Layout)

The code-level specification for integrating this logic inside `CompressedStorageEngine` is outlined below:

### A. State Variable Additions
In the constructor:
```javascript
this.readOnly = false;
this.lockChannel = null;
```

### B. The Handshake Function Spec
```javascript
_establishTabLock() {
  return new Promise((resolve) => {
    const channelName = `vortex-db-lock-${this.dbName}`;
    this.lockChannel = new BroadcastChannel(channelName);
    let hasMasterConflict = false;

    this.lockChannel.onmessage = (event) => {
      const { action } = event.data;
      if (action === 'VFS_PONG') {
        hasMasterConflict = true;
      } else if (action === 'VFS_PING') {
        // Active master replies to any new joiner
        if (this.db && !this.readOnly) {
          this.lockChannel.postMessage({ action: 'VFS_PONG' });
        }
      }
    };

    // Broadcast our arrival
    this.lockChannel.postMessage({ action: 'VFS_PING' });

    // Wait 80ms for potential master replies
    setTimeout(() => {
      resolve(!hasMasterConflict);
    }, 80);
  });
}
```

### C. Gatekeeping in Write Operations
Before executing any VFS write operations (like `appendToGzFile` or `queueLine`), the engine performs a pre-condition validation:
```javascript
if (this.readOnly) {
  throw new Error(`Write Denied: Database '${this.dbName}' is locked in Read-Only Mirror Mode by another tab.`);
}
```
This protects IndexedDB records from overlapping transactions or data corruption.
