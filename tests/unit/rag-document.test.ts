/**
 * memory/src/rag/document.ts — Document, DocumentChunk, DocumentProcessor, loadTextFile, createDocument
 */
import { describe, it, expect } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import {
  Document,
  DocumentChunk,
  DocumentProcessor,
  loadTextFile,
  createDocument,
} from "../../packages/memory/src/rag/document";

// ===========================================================================
// Document
// ===========================================================================
describe("Document", () => {
  it("constructs with content and metadata", () => {
    const doc = new Document({ content: "hello", metadata: { source: "test" } });
    expect(doc.content).toBe("hello");
    expect(doc.metadata.source).toBe("test");
  });

  it("auto-generates docId from content hash", () => {
    const doc = new Document({ content: "hello", metadata: {} });
    expect(typeof doc.docId).toBe("string");
    expect(doc.docId.length).toBeGreaterThan(0);
  });

  it("uses provided docId when given", () => {
    const doc = new Document({ content: "hello", metadata: {}, docId: "my-id" });
    expect(doc.docId).toBe("my-id");
  });

  it("same content produces same docId", () => {
    const a = new Document({ content: "abc", metadata: {} });
    const b = new Document({ content: "abc", metadata: {} });
    expect(a.docId).toBe(b.docId);
  });

  it("different content produces different docId", () => {
    const a = new Document({ content: "abc", metadata: {} });
    const b = new Document({ content: "xyz", metadata: {} });
    expect(a.docId).not.toBe(b.docId);
  });
});

// ===========================================================================
// DocumentChunk
// ===========================================================================
describe("DocumentChunk", () => {
  it("constructs with required fields", () => {
    const chunk = new DocumentChunk({
      content: "chunk text",
      metadata: {},
      docId: "doc1",
      chunkIndex: 0,
    });
    expect(chunk.content).toBe("chunk text");
    expect(chunk.docId).toBe("doc1");
    expect(chunk.chunkIndex).toBe(0);
  });

  it("auto-generates chunkId", () => {
    const chunk = new DocumentChunk({ content: "text", metadata: {}, docId: "d1", chunkIndex: 1 });
    expect(typeof chunk.chunkId).toBe("string");
    expect(chunk.chunkId.length).toBeGreaterThan(0);
  });

  it("uses provided chunkId", () => {
    const chunk = new DocumentChunk({ content: "t", metadata: {}, chunkId: "custom-id" });
    expect(chunk.chunkId).toBe("custom-id");
  });

  it("defaults chunkIndex to 0", () => {
    const chunk = new DocumentChunk({ content: "t", metadata: {} });
    expect(chunk.chunkIndex).toBe(0);
  });
});

// ===========================================================================
// DocumentProcessor
// ===========================================================================
describe("DocumentProcessor", () => {
  it("uses default options", () => {
    const proc = new DocumentProcessor();
    expect(proc.chunkSize).toBe(1000);
    expect(proc.chunkOverlap).toBe(200);
  });

  it("accepts custom options", () => {
    const proc = new DocumentProcessor({ chunkSize: 500, chunkOverlap: 50 });
    expect(proc.chunkSize).toBe(500);
    expect(proc.chunkOverlap).toBe(50);
  });

  it("processDocument() short text returns single chunk", () => {
    const proc = new DocumentProcessor({ chunkSize: 1000 });
    const doc = new Document({ content: "Short text.", metadata: {} });
    const chunks = proc.processDocument(doc);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.content).toBe("Short text.");
  });

  it("processDocument() long text splits into multiple chunks", () => {
    const proc = new DocumentProcessor({ chunkSize: 50, chunkOverlap: 10 });
    const doc = new Document({ content: "a".repeat(200), metadata: {} });
    const chunks = proc.processDocument(doc);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("processDocument() chunk metadata includes doc_id and chunk_index", () => {
    const proc = new DocumentProcessor({ chunkSize: 1000 });
    const doc = new Document({ content: "hello world", metadata: { src: "x" } });
    const chunks = proc.processDocument(doc);
    expect(chunks[0]!.metadata.doc_id).toBe(doc.docId);
    expect(chunks[0]!.metadata.chunk_index).toBe(0);
  });

  it("processDocuments() processes multiple documents", () => {
    const proc = new DocumentProcessor();
    const docs = [
      new Document({ content: "Doc one content.", metadata: {} }),
      new Document({ content: "Doc two content.", metadata: {} }),
    ];
    const chunks = proc.processDocuments(docs);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });

  it("processDocuments() returns empty for empty input", () => {
    const proc = new DocumentProcessor();
    expect(proc.processDocuments([])).toHaveLength(0);
  });

  it("mergeChunks() merges same-doc chunks within maxLength", () => {
    const proc = new DocumentProcessor({ chunkSize: 20, chunkOverlap: 0 });
    const doc = new Document({ content: "hello world", metadata: {} });
    const chunks = proc.processDocument(doc);
    const merged = proc.mergeChunks(chunks, 10000);
    expect(merged.length).toBeLessThanOrEqual(chunks.length);
  });

  it("mergeChunks() returns empty for empty input", () => {
    const proc = new DocumentProcessor();
    expect(proc.mergeChunks([], 2000)).toHaveLength(0);
  });

  it("mergeChunks() does not merge chunks from different docs", () => {
    const proc = new DocumentProcessor();
    const chunks = [
      new DocumentChunk({ content: "A", metadata: {}, docId: "doc1", chunkIndex: 0 }),
      new DocumentChunk({ content: "B", metadata: {}, docId: "doc2", chunkIndex: 0 }),
    ];
    const merged = proc.mergeChunks(chunks, 10000);
    expect(merged).toHaveLength(2);
  });

  it("filterChunks() removes chunks below minLength", () => {
    const proc = new DocumentProcessor();
    const chunks = [
      new DocumentChunk({ content: "short", metadata: {} }),
      new DocumentChunk({ content: "a".repeat(100), metadata: {} }),
    ];
    const filtered = proc.filterChunks(chunks, 50);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.content.length).toBeGreaterThanOrEqual(50);
  });

  it("filterChunks() keeps all chunks when minLength is 0", () => {
    const proc = new DocumentProcessor();
    const chunks = [
      new DocumentChunk({ content: "x", metadata: {} }),
      new DocumentChunk({ content: "y", metadata: {} }),
    ];
    expect(proc.filterChunks(chunks, 0)).toHaveLength(2);
  });

  it("addChunkMetadata() merges metadata into all chunks", () => {
    const proc = new DocumentProcessor();
    const chunks = [
      new DocumentChunk({ content: "a", metadata: { existing: true } }),
      new DocumentChunk({ content: "b", metadata: {} }),
    ];
    proc.addChunkMetadata(chunks, { source: "added" });
    expect(chunks[0]!.metadata.source).toBe("added");
    expect(chunks[1]!.metadata.source).toBe("added");
    expect(chunks[0]!.metadata.existing).toBe(true);
  });

  it("splitText uses separators to find split points", () => {
    const proc = new DocumentProcessor({ chunkSize: 20, chunkOverlap: 0 });
    const text = "Hello world.\n\nSecond paragraph here.\n\nThird one.";
    const doc = new Document({ content: text, metadata: {} });
    const chunks = proc.processDocument(doc);
    expect(chunks.length).toBeGreaterThan(1);
  });
});

// ===========================================================================
// createDocument
// ===========================================================================
describe("createDocument", () => {
  it("creates Document with content and empty metadata", () => {
    const doc = createDocument("hello");
    expect(doc.content).toBe("hello");
    expect(doc.metadata).toEqual({});
  });

  it("creates Document with provided metadata", () => {
    const doc = createDocument("text", { source: "api" });
    expect(doc.metadata.source).toBe("api");
  });
});

// ===========================================================================
// loadTextFile
// ===========================================================================
describe("loadTextFile", () => {
  it("loads file content into Document", async () => {
    const tmp = path.join(os.tmpdir(), `doc-test-${Date.now()}.txt`);
    await fs.writeFile(tmp, "file content here", "utf8");
    try {
      const doc = loadTextFile(tmp);
      expect(doc.content).toBe("file content here");
      expect(doc.metadata.source).toBe(tmp);
      expect(doc.metadata.type).toBe("text_file");
    } finally {
      await fs.unlink(tmp).catch(() => {});
    }
  });
});
