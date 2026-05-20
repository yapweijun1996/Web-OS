# Vortex OS - IndexedDB Lock Protection & Lifecycle Event Specification

This document details the software specifications, event-handling mechanics, and cross-tab communication contracts required to integrate native `onversionchange` (database version changes) and `onblocked` (database connection blocks) event listeners inside `jsonl-storage-engine.js`.

---

## 1. The Critical Need for Lock Protection

IndexedDB is a transactional database that supports concurrent reads but blocks version migrations (schema updates or database deletions) when there are active open connections:
- **Upgrade Blocking**: If Tab A has an active open database connection and Tab B requests a database open with a newer version, Tab B's request will be permanently suspended.
- **Deadlock State**: Tab B is stuck in the `onblocked` state, and Tab A receives a `versionchange` event. If Tab A fails to close its connection, the entire database engine enters a deadlock, freezing the file system across both tabs.

---

## 2. Implementing the `onblocked` Guard on Open Requests

The `onblocked` event fires on the open request when a database connection attempt is blocked because other open connections refuse to close.

### Event Lifecycle & Integration Spec
Inside the `init()` method, before opening the database connection:

1. **Trigger Condition**:
   - `indexedDB.open(this.dbName, this.version)` is invoked.
   - Another tab has the same database open and hasn't released its lock yet.
2. **The `onblocked` Event Handler**:
   - The engine logs a system warning.
   - It fires a system-level notification via the global `SystemEventBus` (`vfs:blocked`) so the Host OS can display a desktop notification to the user.

```javascript
// Inside init()'s IDBOpenDBRequest (English Coding Only)
const request = indexedDB.open(this.dbName, this.version);

request.onblocked = (event) => {
  console.warn(`[VFS] IndexedDB connection to '${this.dbName}' is blocked by an open connection in another tab.`);
  
  // Dispatch system-level event so host UI can display a desktop warning toast
  if (window.parent && window.parent.vortexKernel) {
    window.parent.vortexKernel.bus.emit('vfs:blocked', {
      dbName: this.dbName,
      message: "Please close other active tabs running Vortex OS to allow database connection."
    });
  }
};
```

---

## 3. Implementing the `onversionchange` Self-Destruct Guard

The `onversionchange` event fires on the active database connection instance `db` when another connection requests a version upgrade or a database deletion.

### Event Lifecycle & Integration Spec
Inside `request.onsuccess`, after obtaining the database reference `this.db`:

1. **Trigger Condition**:
   - Another connection requests an upgrade (e.g. another tab calls `indexedDB.open(this.dbName, newVersion)` during a system update) or a deletion (`indexedDB.deleteDatabase(this.dbName)`).
2. **The `onversionchange` Event Handler**:
   - The engine immediately closes its active connection via `this.db.close()`. This unblocks the requesting tab, allowing the upgrade to proceed without deadlocks.
   - It nullifies `this.db = null` to prevent subsequent write operations.
   - It dispatches a system-level event (`vfs:versionchange`) to notify the Host OS that the VFS is now offline, prompting the user to refresh the page.

```javascript
// Inside request.onsuccess (English Coding Only)
request.onsuccess = (event) => {
  this.db = event.target.result;

  // Crucial: Handle version change from other connections
  this.db.onversionchange = () => {
    console.warn(`[VFS] Database '${this.dbName}' is upgrading in another tab. Closing connection immediately to prevent deadlocks.`);
    
    // 1. Force close connection and clear local reference
    this.db.close();
    this.db = null;

    // 2. Dispatch system event to notify Host OS UI of offline state
    if (window.parent && window.parent.vortexKernel) {
      window.parent.vortexKernel.bus.emit('vfs:offline', {
        dbName: this.dbName,
        reason: "Database schema is being upgraded in another tab. Please refresh to reconnect."
      });
    }
  };

  resolve();
};
```
This self-destruction and disconnection protocol guarantees absolute safety against database deadlocks, ensuring that multiple tabs can coordinate VFS schemas seamlessly.
