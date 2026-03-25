/**
 * memory/src/rag/pipeline.ts — pure function coverage (Part 1)
 */
import { describe, it, expect, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  isCjk,
  approxTokenLen,
  detectLang,
  postProcessPdfText,
  isMarkitdownSupportedFormat,
  fallbackTextReader,
  convertToMarkdown,
} from "../../packages/memory/src/rag/pipeline";

describe("isCjk()", () => {
  it("returns true for CJK", () => { expect(isCjk("中")).toBe(true); });
  it("returns false for ASCII", () => { expect(isCjk("a")).toBe(false); });
  it("returns false for empty", () => { expect(isCjk("")).toBe(false); });
});

describe("approxTokenLen()", () => {
  it("counts English words", () => { expect(approxTokenLen("hello world")).toBe(2); });
  it("counts CJK chars", () => { expect(approxTokenLen("中文")).toBeGreaterThanOrEqual(2); });
  it("returns 0 for empty", () => { expect(approxTokenLen("")).toBe(0); });
});

describe("detectLang()", () => {
  it("returns zh for CJK text", () => { expect(detectLang("这是中文文本测试语言检测")).toBe("zh"); });
  it("returns en for English", () => { expect(detectLang("This is English text")).toBe("en"); });
  it("returns unknown for empty", () => { expect(detectLang("")).toBe("unknown"); });
});

describe("postProcessPdfText()", () => {
  it("joins content without empty lines", () => {
    // short lines (length<=2, non-numeric) like 'a','b' are removed by the filter
    const result = postProcessPdfText("hello\n\nworld");
    expect(result).toBe("hello\nworld");
  });
  it("removes pure-digit page numbers", () => {
    expect(postProcessPdfText("text\n5\nmore")).not.toContain("5");
  });
  it("removes noise words", () => {
    expect(postProcessPdfText("hello\ngithub\nworld")).not.toContain("github");
  });
  it("keeps meaningful content", () => {
    expect(postProcessPdfText("TypeScript is great")).toContain("TypeScript");
  });
  it("removes lines with length <= 2 and non-numeric", () => {
    expect(postProcessPdfText("hello\nab\nworld")).not.toContain("ab");
  });
});

describe("isMarkitdownSupportedFormat()", () => {
  it("returns true for .pdf", () => { expect(isMarkitdownSupportedFormat("file.pdf")).toBe(true); });
  it("returns true for .md", () => { expect(isMarkitdownSupportedFormat("README.md")).toBe(true); });
  it("returns true for .ts", () => { expect(isMarkitdownSupportedFormat("src/index.ts")).toBe(true); });
  it("returns false for unknown ext", () => { expect(isMarkitdownSupportedFormat("file.xyz")).toBe(false); });
});

describe("fallbackTextReader()", () => {
  it("returns empty for non-existent", () => { expect(fallbackTextReader("/no/such/file.txt")).toBe(""); });
  it("reads existing file", () => {
    const f = path.join(os.tmpdir(), `fb-${Date.now()}.txt`);
    fs.writeFileSync(f, "hello", "utf-8");
    try { expect(fallbackTextReader(f)).toBe("hello"); } finally { fs.unlinkSync(f); }
  });
});

describe("convertToMarkdown()", () => {
  it("returns empty for non-existent", () => { expect(convertToMarkdown("/no/file.txt")).toBe(""); });
  it("reads file without adapter", () => {
    const f = path.join(os.tmpdir(), `cm-${Date.now()}.txt`);
    fs.writeFileSync(f, "content", "utf-8");
    try { expect(convertToMarkdown(f)).toBe("content"); } finally { fs.unlinkSync(f); }
  });
  it("uses adapter for supported format", () => {
    const f = path.join(os.tmpdir(), `cm-${Date.now()}.md`);
    fs.writeFileSync(f, "original", "utf-8");
    const adapter = { convert: vi.fn().mockReturnValue("converted") };
    try { expect(convertToMarkdown(f, adapter)).toBe("converted"); } finally { fs.unlinkSync(f); }
  });
  it("falls back when adapter throws", () => {
    const f = path.join(os.tmpdir(), `cm-${Date.now()}.md`);
    fs.writeFileSync(f, "fallback", "utf-8");
    const adapter = { convert: vi.fn().mockImplementation(() => { throw new Error("fail"); }) };
    try { expect(convertToMarkdown(f, adapter)).toBe("fallback"); } finally { fs.unlinkSync(f); }
  });
  it("falls back when adapter returns empty", () => {
    const f = path.join(os.tmpdir(), `cm-${Date.now()}.md`);
    fs.writeFileSync(f, "original", "utf-8");
    const adapter = { convert: vi.fn().mockReturnValue("   ") };
    try { expect(convertToMarkdown(f, adapter)).toBe("original"); } finally { fs.unlinkSync(f); }
  });
});
