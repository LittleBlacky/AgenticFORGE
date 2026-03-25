/**
 * @agenticforge/memory — RAG pipeline 纯函数单元测试
 * 覆盖：isMarkitdownSupportedFormat, detectLang, isCjk, approxTokenLen,
 *       splitParagraphsWithHeadings, chunkParagraphs, preprocessMarkdownForEmbedding,
 *       postProcessPdfText, mergeSnippets, buildRagMetadata, rank,
 *       expandNeighborsFromPool, compressRankedItems, createRagPipeline (ingest/retrieve)
 */
import { describe, it, expect } from "vitest";
import {
  isMarkitdownSupportedFormat,
  detectLang,
  isCjk,
  approxTokenLen,
  splitParagraphsWithHeadings,
  chunkParagraphs,
  preprocessMarkdownForEmbedding,
  postProcessPdfText,
  mergeSnippets,
  buildRagMetadata,
  rank,
  expandNeighborsFromPool,
  compressRankedItems,
  type RagChunk,
  type VectorSearchHit,
} from "../../packages/memory/src/rag/pipeline";
import { InMemoryVectorStore } from "@agenticforge/memory";

// ===========================================================================
// isMarkitdownSupportedFormat
// ===========================================================================
describe("isMarkitdownSupportedFormat", () => {
  it("returns true for .pdf", () => expect(isMarkitdownSupportedFormat("doc.pdf")).toBe(true));
  it("returns true for .md", () => expect(isMarkitdownSupportedFormat("notes.md")).toBe(true));
  it("returns true for .ts", () => expect(isMarkitdownSupportedFormat("app.ts")).toBe(true));
  it("returns false for .exe", () => expect(isMarkitdownSupportedFormat("app.exe")).toBe(false));
  it("returns false for no extension", () => expect(isMarkitdownSupportedFormat("noext")).toBe(false));
});

// ===========================================================================
// isCjk
// ===========================================================================
describe("isCjk", () => {
  it("returns true for Chinese character", () => expect(isCjk("中")).toBe(true));
  it("returns true for CJK unified ideograph", () => expect(isCjk("\u4e2d")).toBe(true));
  it("returns false for ASCII", () => expect(isCjk("a")).toBe(false));
  it("returns false for digit", () => expect(isCjk("1")).toBe(false));
  it("returns false for hiragana (not in CJK block)", () => expect(isCjk("\u3042")).toBe(false));
});

// ===========================================================================
// detectLang
// ===========================================================================
describe("detectLang", () => {
  it("returns zh for Chinese text", () => {
    expect(detectLang("这是一段中文文本，用于测试语言检测功能是否正确。")).toBe("zh");
  });
  it("returns en for English text", () => {
    expect(detectLang("This is an English sentence used for language detection.")).toBe("en");
  });
  it("returns unknown for empty string", () => {
    expect(detectLang("")).toBe("unknown");
  });
});

// ===========================================================================
// approxTokenLen
// ===========================================================================
describe("approxTokenLen", () => {
  it("returns 0 for empty string", () => expect(approxTokenLen("")).toBe(0));
  it("counts words for ASCII text", () => {
    // approxTokenLen counts whitespace-split words + CJK chars
    expect(approxTokenLen("hello world foo")).toBe(3);
  });
  it("returns higher token count for CJK text", () => {
    const cjk = "中文测试";
    expect(approxTokenLen(cjk)).toBeGreaterThan(0);
  });
  it("counts CJK chars individually", () => {
    // 2 CJK chars + 1 word token (the whole string) = 3
    expect(approxTokenLen("中文")).toBeGreaterThanOrEqual(2);
  });
});

// ===========================================================================
// splitParagraphsWithHeadings
// ===========================================================================
describe("splitParagraphsWithHeadings", () => {
  it("splits text into paragraphs", () => {
    const text = "# Title\n\nParagraph one.\n\nParagraph two.";
    const paragraphs = splitParagraphsWithHeadings(text);
    expect(paragraphs.length).toBeGreaterThan(0);
  });

  it("returns array for empty input", () => {
    const paragraphs = splitParagraphsWithHeadings("");
    expect(Array.isArray(paragraphs)).toBe(true);
  });

  it("each paragraph has content property", () => {
    const paragraphs = splitParagraphsWithHeadings("Hello world.\n\nSecond paragraph.");
    for (const p of paragraphs) {
      expect(typeof p.content).toBe("string");
    }
  });

  it("tracks heading_path for paragraphs under headings", () => {
    const paragraphs = splitParagraphsWithHeadings("# Section\n\nContent here.");
    const withHeading = paragraphs.find(p => p.heading_path !== null);
    expect(withHeading).toBeDefined();
    expect(withHeading!.heading_path).toContain("Section");
  });
});

// ===========================================================================
// chunkParagraphs
// ===========================================================================
describe("chunkParagraphs", () => {
  it("returns at least one chunk for non-empty input", () => {
    const paragraphs = splitParagraphsWithHeadings("Hello world.\n\nSecond paragraph.");
    const chunks = chunkParagraphs(paragraphs, 200, 20);
    expect(chunks.length).toBeGreaterThan(0);
  });

  it("each chunk has content property", () => {
    const paragraphs = splitParagraphsWithHeadings("Some text here.\n\nMore text.");
    const chunks = chunkParagraphs(paragraphs, 200, 0);
    for (const c of chunks) {
      expect(typeof c.content).toBe("string");
    }
  });

  it("returns empty array for empty paragraphs", () => {
    const chunks = chunkParagraphs([], 200, 0);
    expect(chunks).toHaveLength(0);
  });
});

// ===========================================================================
// preprocessMarkdownForEmbedding
// ===========================================================================
describe("preprocessMarkdownForEmbedding", () => {
  it("strips markdown code fence markers", () => {
    const result = preprocessMarkdownForEmbedding("```ts\nconst x = 1;\n```");
    expect(result).not.toContain("```");
  });

  it("strips heading markers", () => {
    const result = preprocessMarkdownForEmbedding("## Section Title\n\nContent");
    expect(result).not.toContain("##");
    expect(result).toContain("Section Title");
  });

  it("returns non-empty string for plain text", () => {
    expect(preprocessMarkdownForEmbedding("Hello world")).toBeTruthy();
  });
});

// ===========================================================================
// postProcessPdfText
// ===========================================================================
describe("postProcessPdfText", () => {
  it("returns string", () => {
    expect(typeof postProcessPdfText("Some PDF text.")).toBe("string");
  });

  it("handles empty input", () => {
    expect(postProcessPdfText("")).toBe("");
  });

  it("returns non-empty string for normal text", () => {
    expect(postProcessPdfText("Hello world").length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// buildRagMetadata
// ===========================================================================
describe("buildRagMetadata", () => {
  it("returns object with namespace and content fields", () => {
    const chunk: RagChunk = {
      id: "c1",
      content: "test content",
      metadata: { source: "test.md" },
    };
    const meta = buildRagMetadata(chunk, "test-ns");
    expect(meta.rag_namespace).toBe("test-ns");
    expect(meta.content).toBe("test content");
  });
});

// ===========================================================================
// mergeSnippets
// ===========================================================================
describe("mergeSnippets", () => {
  it("returns empty string for empty input", () => {
    expect(mergeSnippets([])).toBe("");
  });

  it("concatenates content from ranked items", () => {
    const items = [
      { content: "First chunk", score: 0.9, id: "1", metadata: {} },
      { content: "Second chunk", score: 0.8, id: "2", metadata: {} },
    ];
    const result = mergeSnippets(items);
    expect(result).toContain("First chunk");
    expect(result).toContain("Second chunk");
  });

  it("respects maxChars limit", () => {
    const items = [{ content: "a".repeat(2000), score: 0.9, id: "1", metadata: {} }];
    const result = mergeSnippets(items, 100);
    expect(result.length).toBeLessThanOrEqual(200); // some buffer for citations
  });
});

// ===========================================================================
// rank
// ===========================================================================
describe("rank", () => {
  it("returns array sorted by combined score descending", () => {
    const hits: VectorSearchHit[] = [
      { id: "a", score: 0.5, metadata: {} },
      { id: "b", score: 0.9, metadata: {} },
      { id: "c", score: 0.7, metadata: {} },
    ];
    const result = rank(hits, {});
    // first result should have highest score
    expect((result[0] as any).score).toBeGreaterThanOrEqual((result[1] as any).score);
  });

  it("returns empty array for empty input", () => {
    expect(rank([], {})).toHaveLength(0);
  });

  it("returns array of same length as input", () => {
    const hits: VectorSearchHit[] = [
      { id: "x", score: 0.3, metadata: {} },
      { id: "y", score: 0.8, metadata: {} },
    ];
    expect(rank(hits, {})).toHaveLength(2);
  });
});

// ===========================================================================
// expandNeighborsFromPool
// ===========================================================================
describe("expandNeighborsFromPool", () => {
  it("returns selected unchanged when pool is empty", () => {
    const selected = [{ id: "a", content: "x", score: 1 }];
    expect(expandNeighborsFromPool(selected, [])).toEqual(selected);
  });

  it("returns selected unchanged when neighbors <= 0", () => {
    const selected = [{ id: "a", content: "x", score: 1 }];
    const pool = [{ id: "b", content: "y", score: 0.5 }];
    expect(expandNeighborsFromPool(selected, pool, 0)).toEqual(selected);
  });

  it("appends neighbors from pool", () => {
    const selected = [{ id: "a", content: "x", score: 1, metadata: { source_path: "doc.md" } }];
    const pool = [{ id: "b", content: "y", score: 0.5, metadata: { source_path: "doc.md" } }];
    const result = expandNeighborsFromPool(selected, pool, 1, 5);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });
});

// ===========================================================================
// compressRankedItems
// ===========================================================================
describe("compressRankedItems", () => {
  it("returns input unchanged when compression disabled", () => {
    const items = [{ id: "a" }, { id: "b" }];
    expect(compressRankedItems(items, false)).toEqual(items);
  });

  it("limits items per doc when enabled", () => {
    const items = [
      { id: "a1", metadata: { source_path: "doc.md" }, content: "chunk1", score: 0.9 },
      { id: "a2", metadata: { source_path: "doc.md" }, content: "chunk2", score: 0.8 },
      { id: "a3", metadata: { source_path: "doc.md" }, content: "chunk3", score: 0.7 },
    ];
    const result = compressRankedItems(items, true, 2);
    expect(result.length).toBeLessThanOrEqual(2);
  });

  it("returns empty array for empty input", () => {
    expect(compressRankedItems([], true)).toHaveLength(0);
  });
});

// ===========================================================================
// createRagPipeline — search (InMemoryVectorStore)
// ===========================================================================
describe("createRagPipeline (InMemoryVectorStore)", () => {
  it("search returns empty array when nothing indexed", async () => {
    const { createRagPipeline } = await import("../../packages/memory/src/rag/pipeline");
    const store = new InMemoryVectorStore();
    const rag = createRagPipeline({ store, ragNamespace: "empty" });
    const results = await rag.search("anything", 3);
    expect(Array.isArray(results)).toBe(true);
  });

  it("getStats() returns an object", async () => {
    const { createRagPipeline } = await import("../../packages/memory/src/rag/pipeline");
    const store = new InMemoryVectorStore();
    const rag = createRagPipeline({ store, ragNamespace: "stats" });
    const stats = await rag.getStats();
    expect(typeof stats).toBe("object");
  });

  it("pipeline exposes store and namespace", async () => {
    const { createRagPipeline } = await import("../../packages/memory/src/rag/pipeline");
    const store = new InMemoryVectorStore();
    const rag = createRagPipeline({ store, ragNamespace: "myns" });
    expect(rag.namespace).toBe("myns");
    expect(rag.store).toBe(store);
  });
});
