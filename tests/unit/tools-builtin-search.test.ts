/**
 * SearchTool 单元测试
 * 覆盖：参数验证、格式化输出、mock 各后端、工具函数
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  SearchTool,
  search,
  searchTavily,
  searchSerpapi,
  searchHybrid,
} from "../../packages/tools-builtin/src/search";

describe("SearchTool — constructor", () => {
  it("has correct name", () => {
    expect(new SearchTool().name).toBe("search");
  });

  it("getParameters() has required input param", () => {
    const p = new SearchTool().getParameters();
    expect(p.find((x) => x.name === "input")?.required).toBe(true);
  });

  it("accepts custom options", () => {
    const t = new SearchTool({ backend: "tavily", tavilyKey: "k" });
    expect(t.name).toBe("search");
  });

  it("description is non-empty", () => {
    expect(new SearchTool().description.length).toBeGreaterThan(0);
  });
});

describe("SearchTool — input validation", () => {
  let tool: SearchTool;
  beforeEach(() => {
    tool = new SearchTool({ backend: "duckduckgo" });
  });

  it("returns error for empty input", async () => {
    expect(await tool.run({ input: "" })).toContain("错误");
  });

  it("returns error when both input and query missing", async () => {
    expect(await tool.run({})).toContain("错误");
  });

  it("uses query as fallback", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      statusText: "OK",
      json: vi.fn().mockResolvedValue({ results: [] }),
      text: vi.fn().mockResolvedValue(""),
    } as unknown as Response);
    expect(typeof (await tool.run({ query: "fallback" }))).toBe("string");
    spy.mockRestore();
  });

  it("unsupported mode falls back to text", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      statusText: "OK",
      text: vi.fn().mockResolvedValue(""),
      json: vi.fn().mockResolvedValue({}),
    } as unknown as Response);
    expect(typeof (await tool.run({ input: "t", mode: "bad", backend: "duckduckgo" }))).toBe(
      "string",
    );
    spy.mockRestore();
  });

  it("unsupported backend falls back to hybrid", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      statusText: "OK",
      text: vi.fn().mockResolvedValue(""),
      json: vi.fn().mockResolvedValue({}),
    } as unknown as Response);
    expect(typeof (await tool.run({ input: "t", backend: "nope" }))).toBe("string");
    spy.mockRestore();
  });
});

describe("SearchTool — DuckDuckGo backend", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns text with query when no results in HTML", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      statusText: "OK",
      text: vi.fn().mockResolvedValue("<html></html>"),
      json: vi.fn().mockResolvedValue({}),
    } as unknown as Response);
    const r = await new SearchTool({ backend: "duckduckgo" }).run({
      input: "my query",
      backend: "duckduckgo",
    });
    expect(r).toContain("my query");
  });

  it("parses JSON-in-HTML result format", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      statusText: "OK",
      text: vi.fn().mockResolvedValue('{"t":"T%20Title","c":"C","u":"https%3A%2F%2Fex.com"}'),
      json: vi.fn().mockResolvedValue({}),
    } as unknown as Response);
    const r = await new SearchTool({ backend: "duckduckgo" }).run({
      input: "t",
      backend: "duckduckgo",
    });
    expect(r).toContain("ex.com");
  });

  it("mode=json returns structured payload", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      statusText: "OK",
      text: vi.fn().mockResolvedValue(""),
      json: vi.fn().mockResolvedValue({}),
    } as unknown as Response);
    const r = await new SearchTool({ backend: "duckduckgo" }).run({
      input: "t",
      backend: "duckduckgo",
      mode: "json",
    });
    const p = JSON.parse(r);
    expect(p).toHaveProperty("results");
    expect(p).toHaveProperty("backend", "duckduckgo");
  });

  it("mode=structured returns JSON", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      statusText: "OK",
      text: vi.fn().mockResolvedValue(""),
      json: vi.fn().mockResolvedValue({}),
    } as unknown as Response);
    const r = await new SearchTool({ backend: "duckduckgo" }).run({
      input: "t",
      backend: "duckduckgo",
      mode: "structured",
    });
    expect(JSON.parse(r)).toHaveProperty("results");
  });

  it("mode=dict returns JSON", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      statusText: "OK",
      text: vi.fn().mockResolvedValue(""),
      json: vi.fn().mockResolvedValue({}),
    } as unknown as Response);
    const r = await new SearchTool({ backend: "duckduckgo" }).run({
      input: "t",
      backend: "duckduckgo",
      mode: "dict",
    });
    expect(JSON.parse(r)).toHaveProperty("backend", "duckduckgo");
  });

  it("respects max_results=2", async () => {
    const entries = Array.from(
      { length: 10 },
      (_, i) => `{"t":"T${i}","c":"C","u":"https://e${i}.com"}`,
    ).join("");
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      statusText: "OK",
      text: vi.fn().mockResolvedValue(entries),
      json: vi.fn().mockResolvedValue({}),
    } as unknown as Response);
    const r = await new SearchTool({ backend: "duckduckgo" }).run({
      input: "t",
      backend: "duckduckgo",
      mode: "json",
      max_results: 2,
    });
    expect((JSON.parse(r) as { results: unknown[] }).results.length).toBeLessThanOrEqual(2);
  });

  it("non-ok response throws", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      statusText: "503",
      text: vi.fn().mockResolvedValue(""),
      json: vi.fn().mockResolvedValue({}),
    } as unknown as Response);
    await expect(
      new SearchTool({ backend: "duckduckgo" }).run({ input: "t", backend: "duckduckgo" }),
    ).rejects.toThrow();
  });
});

describe("SearchTool — Tavily backend", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns results from tavily API", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      statusText: "OK",
      json: vi
        .fn()
        .mockResolvedValue({ results: [{ title: "T", content: "C", url: "https://ex.com" }] }),
      text: vi.fn().mockResolvedValue(""),
    } as unknown as Response);
    const r = await new SearchTool({ backend: "tavily", tavilyKey: "k" }).run({
      input: "q",
      backend: "tavily",
    });
    expect(r).toContain("ex.com");
  });

  it("mode=json returns structured payload", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      statusText: "OK",
      json: vi
        .fn()
        .mockResolvedValue({ results: [{ title: "T", content: "C", url: "https://ex.com" }] }),
      text: vi.fn().mockResolvedValue(""),
    } as unknown as Response);
    const r = await new SearchTool({ backend: "tavily", tavilyKey: "k" }).run({
      input: "q",
      backend: "tavily",
      mode: "json",
    });
    const p = JSON.parse(r);
    expect(p).toHaveProperty("results");
    expect(p).toHaveProperty("backend", "tavily");
  });

  it("handles empty results", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      statusText: "OK",
      json: vi.fn().mockResolvedValue({ results: [] }),
      text: vi.fn().mockResolvedValue(""),
    } as unknown as Response);
    const r = await new SearchTool({ backend: "tavily", tavilyKey: "k" }).run({
      input: "q",
      backend: "tavily",
    });
    expect(typeof r).toBe("string");
  });

  it("throws on non-ok response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      statusText: "401",
      json: vi.fn().mockResolvedValue({}),
      text: vi.fn().mockResolvedValue(""),
    } as unknown as Response);
    await expect(
      new SearchTool({ backend: "tavily", tavilyKey: "k" }).run({ input: "q", backend: "tavily" }),
    ).rejects.toThrow();
  });

  it("throws when no API key", async () => {
    await expect(
      new SearchTool({ backend: "tavily" }).run({ input: "q", backend: "tavily" }),
    ).rejects.toThrow("TAVILY_API_KEY");
  });
});

describe("SearchTool — SerpApi backend", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns results from serpapi", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      statusText: "OK",
      json: vi.fn().mockResolvedValue({
        organic_results: [{ title: "T", snippet: "S", link: "https://serp.com" }],
      }),
      text: vi.fn().mockResolvedValue(""),
    } as unknown as Response);
    const r = await new SearchTool({ backend: "serpapi", serpapiKey: "k" }).run({
      input: "q",
      backend: "serpapi",
    });
    expect(r).toContain("serp.com");
  });

  it("mode=json returns structured payload", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      statusText: "OK",
      json: vi.fn().mockResolvedValue({
        organic_results: [{ title: "T", snippet: "S", link: "https://serp.com" }],
      }),
      text: vi.fn().mockResolvedValue(""),
    } as unknown as Response);
    const r = await new SearchTool({ backend: "serpapi", serpapiKey: "k" }).run({
      input: "q",
      backend: "serpapi",
      mode: "json",
    });
    const p = JSON.parse(r);
    expect(p).toHaveProperty("results");
    expect(p).toHaveProperty("backend", "serpapi");
  });

  it("handles empty organic_results", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      statusText: "OK",
      json: vi.fn().mockResolvedValue({ organic_results: [] }),
      text: vi.fn().mockResolvedValue(""),
    } as unknown as Response);
    const r = await new SearchTool({ backend: "serpapi", serpapiKey: "k" }).run({
      input: "q",
      backend: "serpapi",
    });
    expect(typeof r).toBe("string");
  });

  it("throws on non-ok response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      statusText: "429",
      json: vi.fn().mockResolvedValue({}),
      text: vi.fn().mockResolvedValue(""),
    } as unknown as Response);
    await expect(
      new SearchTool({ backend: "serpapi", serpapiKey: "k" }).run({
        input: "q",
        backend: "serpapi",
      }),
    ).rejects.toThrow();
  });

  it("throws when no API key", async () => {
    await expect(
      new SearchTool({ backend: "serpapi" }).run({ input: "q", backend: "serpapi" }),
    ).rejects.toThrow("SERPAPI_API_KEY");
  });
});

describe("SearchTool — SearXNG backend", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns results from searxng", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      statusText: "OK",
      json: vi
        .fn()
        .mockResolvedValue({ results: [{ title: "T", content: "C", url: "https://searx.com" }] }),
      text: vi.fn().mockResolvedValue(""),
    } as unknown as Response);
    const r = await new SearchTool({ backend: "searxng" }).run({ input: "q", backend: "searxng" });
    expect(r).toContain("searx.com");
  });

  it("mode=json returns structured payload", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      statusText: "OK",
      json: vi
        .fn()
        .mockResolvedValue({ results: [{ title: "T", content: "C", url: "https://searx.com" }] }),
      text: vi.fn().mockResolvedValue(""),
    } as unknown as Response);
    const r = await new SearchTool({ backend: "searxng" }).run({
      input: "q",
      backend: "searxng",
      mode: "json",
    });
    const p = JSON.parse(r);
    expect(p).toHaveProperty("results");
    expect(p).toHaveProperty("backend", "searxng");
  });

  it("throws on non-ok response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      statusText: "500",
      json: vi.fn().mockResolvedValue({}),
      text: vi.fn().mockResolvedValue(""),
    } as unknown as Response);
    await expect(
      new SearchTool({ backend: "searxng" }).run({ input: "q", backend: "searxng" }),
    ).rejects.toThrow();
  });
});

describe("SearchTool — Perplexity backend", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns content from perplexity", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      statusText: "OK",
      json: vi.fn().mockResolvedValue({ choices: [{ message: { content: "Perplexity answer" } }] }),
      text: vi.fn().mockResolvedValue(""),
    } as unknown as Response);
    const r = await new SearchTool({ backend: "perplexity", perplexityKey: "k" }).run({
      input: "q",
      backend: "perplexity",
    });
    expect(r).toContain("Perplexity answer");
  });

  it("mode=json returns structured payload", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      statusText: "OK",
      json: vi.fn().mockResolvedValue({ choices: [{ message: { content: "ans" } }] }),
      text: vi.fn().mockResolvedValue(""),
    } as unknown as Response);
    const r = await new SearchTool({ backend: "perplexity", perplexityKey: "k" }).run({
      input: "q",
      backend: "perplexity",
      mode: "json",
    });
    const p = JSON.parse(r);
    expect(p).toHaveProperty("results");
    expect(p).toHaveProperty("backend", "perplexity");
  });

  it("throws on non-ok response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      statusText: "403",
      json: vi.fn().mockResolvedValue({}),
      text: vi.fn().mockResolvedValue(""),
    } as unknown as Response);
    await expect(
      new SearchTool({ backend: "perplexity", perplexityKey: "k" }).run({
        input: "q",
        backend: "perplexity",
      }),
    ).rejects.toThrow();
  });

  it("throws when no API key", async () => {
    await expect(
      new SearchTool({ backend: "perplexity" }).run({ input: "q", backend: "perplexity" }),
    ).rejects.toThrow("PERPLEXITY_API_KEY");
  });
});

describe("search() utility function", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns a string result", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      statusText: "OK",
      text: vi.fn().mockResolvedValue(""),
      json: vi.fn().mockResolvedValue({}),
    } as unknown as Response);
    const r = await search("test query");
    expect(typeof r).toBe("string");
  });

  it("accepts backend string", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      statusText: "OK",
      text: vi.fn().mockResolvedValue(""),
      json: vi.fn().mockResolvedValue({}),
    } as unknown as Response);
    const r = await search("test", "duckduckgo");
    expect(typeof r).toBe("string");
  });
});

describe("searchTavily() utility function", () => {
  afterEach(() => vi.restoreAllMocks());

  it("throws when no API key configured", async () => {
    await expect(searchTavily("test")).rejects.toThrow("TAVILY_API_KEY");
  });
});

describe("searchSerpapi() utility function", () => {
  afterEach(() => vi.restoreAllMocks());

  it("throws when no API key configured", async () => {
    await expect(searchSerpapi("test")).rejects.toThrow("SERPAPI_API_KEY");
  });
});

describe("searchHybrid() utility function", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns a string result", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      statusText: "OK",
      text: vi.fn().mockResolvedValue(""),
      json: vi.fn().mockResolvedValue({}),
    } as unknown as Response);
    const r = await searchHybrid("test");
    expect(typeof r).toBe("string");
  });
});
