/**
 * memory/src/rag/pipeline.ts — pure function coverage (Part 2)
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  splitParagraphsWithHeadings,
  chunkParagraphs,
  preprocessMarkdownForEmbedding,
  buildRagMetadata,
  computeGraphSignalsFromPool,
  loadDocuments,
  loadAndChunkTexts,
} from "../../packages/memory/src/rag/pipeline";

describe("splitParagraphsWithHeadings()", () => {
  it("splits on blank lines", () => {
    const r = splitParagraphsWithHeadings("para one\n\npara two");
    expect(r.length).toBe(2);
  });
  it("tracks heading path", () => {
    const r = splitParagraphsWithHeadings("# Section\n\nContent");
    const h = r.find((p) => p.heading_path !== null);
    expect(h?.heading_path).toContain("Section");
  });
  it("returns single item for plain text", () => {
    const r = splitParagraphsWithHeadings("just one paragraph");
    expect(r.length).toBe(1);
  });
  it("handles empty string", () => {
    expect(Array.isArray(splitParagraphsWithHeadings(""))).toBe(true);
  });
  it("handles nested headings", () => {
    const r = splitParagraphsWithHeadings("# H1\n\n## H2\n\nContent");
    const deep = r.find((p) => p.heading_path?.includes("H2"));
    expect(deep).toBeDefined();
  });
  it("resets heading stack for lower-level heading", () => {
    const r = splitParagraphsWithHeadings("## H2\n\n# H1\n\nContent");
    expect(r.length).toBeGreaterThan(0);
  });
});

describe("chunkParagraphs()", () => {
  const para = (content: string) => ({
    content,
    heading_path: null as string | null,
    start: 0,
    end: content.length,
  });

  it("combines short paragraphs", () => {
    const chunks = chunkParagraphs([para("hello"), para("world")], 100, 0);
    expect(chunks.length).toBeGreaterThan(0);
  });
  it("splits when over chunk size", () => {
    const paras = Array.from({ length: 10 }, (_, i) => para(`word${i} `.repeat(20)));
    const chunks = chunkParagraphs(paras, 10, 0);
    expect(chunks.length).toBeGreaterThan(1);
  });
  it("applies overlap", () => {
    const paras = Array.from({ length: 6 }, (_, i) => para(`para${i} content`));
    const noOverlap = chunkParagraphs(paras, 5, 0);
    const withOverlap = chunkParagraphs(paras, 5, 2);
    expect(withOverlap.length).toBeGreaterThanOrEqual(noOverlap.length);
  });
  it("returns empty for empty input", () => {
    expect(chunkParagraphs([], 100, 0)).toHaveLength(0);
  });
});

describe("preprocessMarkdownForEmbedding()", () => {
  it("strips code blocks", () => {
    const r = preprocessMarkdownForEmbedding("text\n```js\ncode\n```\nmore");
    expect(r).not.toContain("```");
  });
  it("preserves text", () => {
    expect(preprocessMarkdownForEmbedding("# Title\n\nContent.")).toContain("Content");
  });
  it("handles empty", () => {
    expect(preprocessMarkdownForEmbedding("")).toBe("");
  });
});

// buildRagMetadata(chunk, ragNamespace?, userId?)
describe("buildRagMetadata()", () => {
  it("sets is_rag_data and namespace", () => {
    const chunk = { id: "c1", content: "t", metadata: {} };
    const m = buildRagMetadata(chunk, "docs");
    expect(m.is_rag_data).toBe(true);
    expect(m.rag_namespace).toBe("docs");
  });
  it("merges existing metadata", () => {
    const chunk = { id: "c1", content: "t", metadata: { source: "f.md" } };
    const m = buildRagMetadata(chunk, "ns");
    expect(m.source).toBe("f.md");
  });
  it("defaults namespace to default", () => {
    const chunk = { id: "c1", content: "t", metadata: {} };
    const m = buildRagMetadata(chunk);
    expect(m.rag_namespace).toBe("default");
  });
});

describe("computeGraphSignalsFromPool()", () => {
  it("returns empty for empty input", () => {
    expect(computeGraphSignalsFromPool([])).toEqual({});
  });
  it("boosts same-doc items", () => {
    const hits = [
      { id: "a", score: 0.9, metadata: { doc_id: "doc1", start: 0, end: 100 } },
      { id: "b", score: 0.8, metadata: { doc_id: "doc1", start: 50, end: 150 } },
    ];
    const signals = computeGraphSignalsFromPool(hits);
    expect(typeof signals["a"]).toBe("number");
  });
  it("handles single item", () => {
    const hits = [{ id: "x", score: 0.9, metadata: { doc_id: "d1", start: 0, end: 50 } }];
    const signals = computeGraphSignalsFromPool(hits);
    expect(signals["x"]).toBeDefined();
  });

  it("breaks proximity scan when distance exceeds window", () => {
    const hits = [
      { id: "p1", score: 0.9, metadata: { doc_id: "docP", start: 0 } },
      { id: "p2", score: 0.8, metadata: { doc_id: "docP", start: 10000 } },
      { id: "p3", score: 0.7, metadata: { doc_id: "docP", start: 20000 } },
    ];

    const signals = computeGraphSignalsFromPool(hits, 1, 1, 50);
    expect(Object.keys(signals).length).toBe(3);
    expect(signals["p1"]).toBeGreaterThan(0);
  });

  it("uses default start=0 when metadata.start is missing", () => {
    const hits = [
      { id: "m1", score: 0.9, metadata: { doc_id: "docM" } },
      { id: "m2", score: 0.8, metadata: { doc_id: "docM", start: 1 } },
    ];

    const signals = computeGraphSignalsFromPool(hits, 1, 1, 5);
    expect(typeof signals["m1"]).toBe("number");
    expect(typeof signals["m2"]).toBe("number");
  });
});

// loadDocuments({ paths, ... })
describe("loadDocuments()", () => {
  it("returns empty for empty paths", () => {
    expect(loadDocuments({ paths: [] })).toHaveLength(0);
  });
  it("loads real temp file", () => {
    const f = path.join(os.tmpdir(), `ld-${Date.now()}.txt`);
    fs.writeFileSync(f, "document content here", "utf-8");
    try {
      const docs = loadDocuments({ paths: [f] });
      expect(docs.length).toBeGreaterThanOrEqual(1);
      expect(docs[0].markdownText).toContain("document");
    } finally {
      fs.unlinkSync(f);
    }
  });
  it("skips non-existent files", () => {
    expect(Array.isArray(loadDocuments({ paths: ["/no/such/file.txt"] }))).toBe(true);
  });
});

// loadAndChunkTexts({ paths, ... })
describe("loadAndChunkTexts()", () => {
  it("returns empty for empty paths", () => {
    expect(loadAndChunkTexts({ paths: [] })).toHaveLength(0);
  });
  it("chunks real file content", () => {
    const f = path.join(os.tmpdir(), `lct-${Date.now()}.txt`);
    fs.writeFileSync(f, "para one\n\npara two\n\npara three", "utf-8");
    try {
      const chunks = loadAndChunkTexts({ paths: [f], chunkSize: 5, chunkOverlap: 0 });
      expect(chunks.length).toBeGreaterThan(0);
    } finally {
      fs.unlinkSync(f);
    }
  });
});
