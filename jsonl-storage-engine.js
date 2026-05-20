class CompressedStorageEngine {
  constructor(dbName = 'WebOSFileSystem', version = 1) {
    this.dbName = dbName;
    this.version = version;
    this.db = null;

    // VORTEX-102: Transactional sync & auto-save state.
    this.autoSaveDelay = 500;            // ms of idle before a dirty file is flushed
    this.writeChains = new Map();        // filePath -> Promise (serializes DB writes)
    this.pendingLines = new Map();       // filePath -> string[] (dirty in-memory buffer)
    this.flushTimers = new Map();        // filePath -> debounce timer id
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onblocked = () => {
        console.warn(`[VFS] Database '${this.dbName}' connection blocked by another active tab!`);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('files')) {
          db.createObjectStore('files', { keyPath: 'filePath' });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;

        this.db.onversionchange = () => {
          console.warn(`[VFS] Database '${this.dbName}' is upgrading in another tab. Closing connection immediately.`);
          this.db.close();
          this.db = null;
        };

        resolve();
      };

      request.onerror = (event) => reject(event.target.error);
    });
  }

  // Serializes every mutation of a given file through a per-path promise chain.
  // This IS the VORTEX-107 asynchronous write mutex: concurrent writes to the
  // same filePath queue sequentially and resolve in order. Without it, two
  // concurrent read-modify-write appends race on the same record and one write
  // is silently lost (see test.html Test 4 for the 25-way concurrency proof).
  _enqueue(filePath, task) {
    const prev = this.writeChains.get(filePath) || Promise.resolve();
    const result = prev.then(() => task(), () => task());
    const chain = result.then(() => {}, () => {});
    this.writeChains.set(filePath, chain);
    // Prune the Map entry once this chain tail settles and no newer write has replaced it.
    chain.then(() => { if (this.writeChains.get(filePath) === chain) this.writeChains.delete(filePath); });
    return result;
  }

  async appendToGzFile(filePath, rawJsonLine) {
    const jsonStringWithNewline = rawJsonLine.endsWith('\n') ? rawJsonLine : rawJsonLine + '\n';
    return this._enqueue(filePath, () => this._commitAppend(filePath, jsonStringWithNewline));
  }

  // Compresses `text` into its own independent gzip chunk and appends it to the
  // file's chunk list. Each chunk is a self-contained gzip member: the browser's
  // native DecompressionStream does NOT decode physically concatenated gzip
  // members, so chunks must stay separate and be decoded individually on read.
  // Runs only inside the per-path write queue, so the read-then-write is atomic.
  async _commitAppend(filePath, text) {
    const chunks = await this.readChunks(filePath);
    const compressedChunk = await this.compressString(text);
    chunks.push(compressedChunk);
    await this.writeChunks(filePath, chunks);
  }

  // VORTEX-102: auto-save entry point. Buffers a line in memory, marks the
  // file dirty, and (re)arms a debounced flush. Returns immediately.
  queueLine(filePath, rawJsonLine) {
    const line = rawJsonLine.endsWith('\n') ? rawJsonLine : rawJsonLine + '\n';
    if (!this.pendingLines.has(filePath)) {
      this.pendingLines.set(filePath, []);
    }
    this.pendingLines.get(filePath).push(line);
    this._scheduleFlush(filePath);
  }

  isDirty(filePath) {
    const lines = this.pendingLines.get(filePath);
    return !!(lines && lines.length > 0);
  }

  _scheduleFlush(filePath) {
    if (this.flushTimers.has(filePath)) {
      clearTimeout(this.flushTimers.get(filePath));
    }
    const timer = setTimeout(() => {
      this.flushTimers.delete(filePath);
      this.flush(filePath);
    }, this.autoSaveDelay);
    this.flushTimers.set(filePath, timer);
  }

  // Compiles the dirty buffer into a single batched compressed append.
  async flush(filePath) {
    if (this.flushTimers.has(filePath)) {
      clearTimeout(this.flushTimers.get(filePath));
      this.flushTimers.delete(filePath);
    }
    const lines = this.pendingLines.get(filePath);
    if (!lines || lines.length === 0) return;

    // Take ownership of the buffer so lines queued during the flush are not lost.
    this.pendingLines.set(filePath, []);
    const batch = lines.join('');
    return this._enqueue(filePath, () => this._commitAppend(filePath, batch));
  }

  // Flush all dirty files and close the IndexedDB connection. Call on teardown
  // to guarantee pending lines are committed before the engine is discarded.
  async close() {
    await this.flushAll();
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  // Durability barrier: flush every dirty file. Wire to `beforeunload` so an
  // app/tab close commits pending lines before the process is gone.
  async flushAll() {
    const paths = [...this.pendingLines.keys()];
    await Promise.all(paths.map((filePath) => this.flush(filePath)));
  }

  async readGzFileLines(filePath) {
    // Drain any pending in-memory lines so reads observe the latest state.
    if (this.isDirty(filePath)) {
      await this.flush(filePath);
    }
    const chunks = await this.readChunks(filePath);
    if (chunks.length === 0) return [];

    // Decode each gzip chunk independently, then concatenate the plain text.
    const texts = await Promise.all(chunks.map((chunk) => this.decompressBuffer(chunk)));
    const decompressedText = texts.join('');
    if (!decompressedText.trim()) return [];
    return decompressedText.trim().split('\n').filter(line => line.trim()).map(line => {
      try {
        return JSON.parse(line);
      } catch {
        console.warn('[VFS] Skipping corrupt JSONL line:', line.slice(0, 80));
        return null;
      }
    }).filter(v => v !== null);
  }

  async listFiles(prefix = '/') {
    const normalizedPrefix = prefix || '/';
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['files'], 'readonly');
      const request = transaction.objectStore('files').getAllKeys();

      request.onsuccess = () => {
        const keys = request.result
          .filter((key) => typeof key === 'string' && key.startsWith(normalizedPrefix))
          .sort();
        resolve(keys);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async compressString(str) {
    const stream = new Blob([str]).stream()
      .pipeThrough(new CompressionStream('gzip'));
    const response = new Response(stream);
    return await response.arrayBuffer();
  }

  async decompressBuffer(buffer) {
    const stream = new Blob([buffer]).stream()
      .pipeThrough(new DecompressionStream('gzip'));
    const response = new Response(stream);
    return await response.text();
  }

  async readChunks(filePath) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['files'], 'readonly');
      const request = transaction.objectStore('files').get(filePath);

      request.onsuccess = () => {
        const record = request.result;
        resolve(record && Array.isArray(record.chunks) ? record.chunks.slice() : []);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async writeChunks(filePath, chunks) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['files'], 'readwrite');
      const store = transaction.objectStore('files');
      const request = store.put({ filePath, chunks });

      // Resolve on transaction completion, not just request success, so the
      // raw binary chunks are guaranteed durably committed before we continue.
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      request.onerror = () => reject(request.error);
    });
  }
}
export { CompressedStorageEngine };
