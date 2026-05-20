# Vortex OS Virtual File System (VFS) & Compressed Storage Engine

Vortex OS leverages a high-performance, client-side Virtual File System (VFS) to manage files, system logs, and user configurations completely in-browser. 

This document explains the inner workings of the `CompressedStorageEngine`, utilizing **IndexedDB** as the database layer and the native **Web Compression Streams API** for background gzip file compression.

---

## 1. Under-the-Hood Storage Format

Rather than storing files as raw strings or heavy SQLite databases, Vortex OS uses a log-structured **JSONL.gz** storage format.

- **JSONL (JSON Lines)**: A text-based format where each line is a valid JSON object. This is highly suitable for logging, document updates, and streaming since new rows can be written using simple string concatenation without parsing the existing file.
- **gzip compression**: Each appended batch is compressed into its own independent gzip member. Note that the browser's native `DecompressionStream('gzip')` does **not** decode physically concatenated gzip members — it errors on the second member. A file is therefore stored as a *list of independent gzip chunks*; on read, every chunk is decompressed separately and the resulting text segments are concatenated.

---

## 2. Low-Overhead Streaming Append Pipeline

The `appendToGzFile(filePath, rawJsonLine)` pipeline performs the following steps during file writing:

```
+----------------------------------------------------------------------+
|                     appendToGzFile(filePath, line)                   |
+----------------------------------------------------------------------+
                                  |
              Enqueue on the per-file serialized write chain
                                  |
                                  v
              Read the file's existing chunk list from DB
                                  |
                                  v
          Compress `line` into a NEW independent gzip chunk
                                  |
                                  + <--- Push chunk onto the list
                                  |
                                  v
              Save the updated chunk list back to IndexedDB
```

### Appending a New Chunk

To avoid decompressing, appending, and recompressing the entire file (which is very expensive), Vortex OS compresses only the new text into its own gzip chunk and pushes it onto the file's chunk list:

```javascript
async _commitAppend(filePath, text) {
  const chunks = await this.readChunks(filePath);
  const compressedChunk = await this.compressString(text);
  chunks.push(compressedChunk);
  await this.writeChunks(filePath, chunks);
}
```

Every mutation of a file runs inside a per-path **serialized write queue** (`_enqueue`). Without it, two concurrent read-modify-write appends would race on the same record and one write would be silently lost. This queue is the **VORTEX-107 asynchronous write mutex**: concurrent writes to the same `filePath` are queued sequentially and resolve in order with zero data loss (see `test.html` Test 4 for the 25-way concurrency proof).

---

## 3. Native Web Compression Streams API Integration

Modern browsers provide hardware-accelerated stream compression out-of-the-box. The `CompressedStorageEngine` integrates `CompressionStream` and `DecompressionStream` as follows:

### Compressing a String to Gzip

```javascript
async compressString(str) {
  // 1. Create a Stream from a Blob containing the text data
  const stream = new Blob([str]).stream()
    // 2. Pipe the stream through the browser's native Gzip engine
    .pipeThrough(new CompressionStream('gzip'));
  const response = new Response(stream);
  // 3. Return the compressed ArrayBuffer
  return await response.arrayBuffer();
}
```

### Decompressing a Gzip Buffer back to String

```javascript
async decompressBuffer(buffer) {
  const stream = new Blob([buffer]).stream()
    .pipeThrough(new DecompressionStream('gzip'));
  const response = new Response(stream);
  return await response.text();
}
```

---

## 4. Performance Optimizations & Trade-offs

1. **Avoid Layout Thrashing during writes**: Keep storage transaction processes off the rendering thread. Use Web Workers or asynchronous Event loops to ensure smooth 60fps window drags while writing files.
2. **Batching writes**: If an application (or AI Agent) performs rapid back-to-back logs, compile lines in a memory buffer first, then perform a single transaction write to IndexedDB to avoid excessive I/O wait times.
3. **ArrayBuffer footprint**: Keep file segments manageable. For very large databases, partition files into multi-part chunks (e.g., `part_0001.gz`) rather than relying on a single large concatenated buffer to avoid browser memory limitations.
