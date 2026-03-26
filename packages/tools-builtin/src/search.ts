import { Tool, type ToolParameter } from "@agenticforge/tools";

const CHARS_PER_TOKEN = 4;
const DEFAULT_MAX_RESULTS = 5;
const SUPPORTED_RETURN_MODES = new Set(["text", "structured", "json", "dict"]);
const SUPPORTED_BACKENDS = new Set([
  "hybrid",
  "advanced",
  "tavily",
  "serpapi",
  "duckduckgo",
  "searxng",
  "perplexity",
]);

type SearchResult = {
  title: string;
  url: string;
  content: string;
  raw_content?: string;
};

type StructuredPayload = {
  results: SearchResult[];
  backend: string;
  answer?: string | null;
  notices?: string[];
};

type SerpApiOrganicResult = {
  title?: string;
  snippet?: string;
  link?: string;
};

type SerpApiResponse = {
  answer_box_list?: string[];
  answer_box?: {
    answer?: string;
    snippet?: string;
  };
  knowledge_graph?: {
    description?: string;
  };
  organic_results?: SerpApiOrganicResult[];
};

type TavilyResponse = {
  results?: Array<{
    title?: string;
    url?: string;
    content?: string;
    raw_content?: string;
  }>;
  answer?: string;
};

type SearxngResponse = {
  results?: Array<{
    url?: string;
    link?: string;
    title?: string;
    content?: string;
    snippet?: string;
  }>;
};

function limitText(text: string, tokenLimit: number): string {
  const charLimit = tokenLimit * CHARS_PER_TOKEN;
  if (text.length <= charLimit) return text;
  return `${text.slice(0, charLimit)}... [truncated]`;
}

async function fetchRawContent(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { method: "GET" });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

function normalizedResult(
  title: string,
  url: string,
  content: string,
  rawContent?: string | null,
): SearchResult {
  const payload: SearchResult = {
    title: title || url,
    url,
    content: content || "",
  };
  if (rawContent) {
    payload.raw_content = rawContent;
  }
  return payload;
}

function structuredPayload(
  results: SearchResult[],
  backend: string,
  answer?: string | null,
  notices?: string[],
): StructuredPayload {
  return {
    results,
    backend,
    answer: answer ?? null,
    notices: notices ?? [],
  };
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class SearchTool extends Tool {
  private readonly tavilyKey?: string;
  private readonly serpapiKey?: string;
  private readonly perplexityKey?: string;
  private backend: string;

  constructor(options?: {
    backend?: string;
    tavilyKey?: string;
    serpapiKey?: string;
    perplexityKey?: string;
  }) {
    super(
      "search",
      "智能网页搜索引擎，支持 Tavily、SerpApi、DuckDuckGo、SearXNG、Perplexity 等后端，可返回结构化或文本化的搜索结果。",
    );

    this.backend = (options?.backend ?? "hybrid").toLowerCase();
    this.tavilyKey = options?.tavilyKey ?? process.env.TAVILY_API_KEY;
    this.serpapiKey = options?.serpapiKey ?? process.env.SERPAPI_API_KEY;
    this.perplexityKey = options?.perplexityKey ?? process.env.PERPLEXITY_API_KEY;
  }

  run(parameters: Record<string, unknown>): string | Promise<string> {
    const query = String((parameters.input ?? parameters.query ?? "") as string).trim();
    if (!query) return "错误：搜索查询不能为空";

    const backend = String(parameters.backend ?? this.backend ?? "hybrid").toLowerCase();
    const targetBackend = SUPPORTED_BACKENDS.has(backend) ? backend : "hybrid";

    const mode = String(parameters.mode ?? parameters.return_mode ?? "text").toLowerCase();
    const returnMode = SUPPORTED_RETURN_MODES.has(mode) ? mode : "text";

    const fetchFullPage = Boolean(parameters.fetch_full_page ?? false);
    const maxResults = Number(parameters.max_results ?? DEFAULT_MAX_RESULTS);
    const maxTokens = Number(parameters.max_tokens_per_source ?? 2000);
    const loopCount = Number(parameters.loop_count ?? 0);

    return this.structuredSearch({
      query,
      backend: targetBackend,
      fetchFullPage,
      maxResults,
      maxTokens,
      loopCount,
      returnMode,
    });
  }

  getParameters(): ToolParameter[] {
    return [
      {
        name: "input",
        type: "string",
        description: "搜索查询关键词",
        required: true,
        default: null,
      },
    ];
  }

  private async structuredSearch(params: {
    query: string;
    backend: string;
    fetchFullPage: boolean;
    maxResults: number;
    maxTokens: number;
    loopCount: number;
    returnMode: string;
  }): Promise<string> {
    const payload = await this.runStructuredSearch(params);
    if (["structured", "json", "dict"].includes(params.returnMode)) {
      return JSON.stringify(payload, null, 2);
    }
    return this.formatTextResponse(params.query, payload);
  }

  private async runStructuredSearch(params: {
    query: string;
    backend: string;
    fetchFullPage: boolean;
    maxResults: number;
    maxTokens: number;
    loopCount: number;
  }): Promise<StructuredPayload> {
    const targetBackend = params.backend === "hybrid" ? "advanced" : params.backend;

    if (targetBackend === "tavily") {
      return this.searchTavily(params);
    }
    if (targetBackend === "serpapi") {
      return this.searchSerpapi(params);
    }
    if (targetBackend === "duckduckgo") {
      return this.searchDuckDuckGo(params);
    }
    if (targetBackend === "searxng") {
      return this.searchSearxng(params);
    }
    if (targetBackend === "perplexity") {
      return this.searchPerplexity(params);
    }
    if (targetBackend === "advanced") {
      return this.searchAdvanced(params);
    }

    throw new Error(`Unsupported search backend: ${params.backend}`);
  }

  private async searchTavily(params: {
    query: string;
    fetchFullPage: boolean;
    maxResults: number;
    maxTokens: number;
  }): Promise<StructuredPayload> {
    if (!this.tavilyKey) {
      throw new Error("TAVILY_API_KEY 未配置，无法使用 Tavily 搜索");
    }

    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.tavilyKey}`,
      },
      body: JSON.stringify({
        query: params.query,
        max_results: params.maxResults,
        include_raw_content: params.fetchFullPage,
      }),
    });

    if (!response.ok) {
      throw new Error(`Tavily 搜索失败: ${response.statusText}`);
    }

    const data = (await response.json()) as TavilyResponse;
    const results = (data.results ?? []).slice(0, params.maxResults).map((item) => {
      const raw = params.fetchFullPage ? (item.raw_content ?? item.content) : null;
      const rawContent = raw ? limitText(raw, params.maxTokens) : undefined;
      return normalizedResult(
        item.title ?? item.url ?? "",
        item.url ?? "",
        item.content ?? "",
        rawContent,
      );
    });

    return structuredPayload(results, "tavily", data.answer ?? null);
  }

  private async searchSerpapi(params: {
    query: string;
    fetchFullPage: boolean;
    maxResults: number;
    maxTokens: number;
  }): Promise<StructuredPayload> {
    if (!this.serpapiKey) {
      throw new Error("SERPAPI_API_KEY 未配置，无法使用 SerpApi 搜索");
    }

    const url = new URL("https://serpapi.com/search.json");
    url.searchParams.set("engine", "google");
    url.searchParams.set("q", params.query);
    url.searchParams.set("api_key", this.serpapiKey);
    url.searchParams.set("gl", "cn");
    url.searchParams.set("hl", "zh-cn");
    url.searchParams.set("num", String(params.maxResults));

    const response = await fetch(url.toString(), { method: "GET" });
    if (!response.ok) {
      throw new Error(`SerpApi 搜索失败: ${response.statusText}`);
    }

    const data = (await response.json()) as SerpApiResponse;
    const answer = data.answer_box?.answer ?? data.answer_box?.snippet;

    const results = (data.organic_results ?? []).slice(0, params.maxResults).map((item) => {
      const raw = params.fetchFullPage ? (item.snippet ?? "") : null;
      const rawContent = raw ? limitText(raw, params.maxTokens) : undefined;
      return normalizedResult(
        item.title ?? item.link ?? "",
        item.link ?? "",
        item.snippet ?? "",
        rawContent,
      );
    });

    return structuredPayload(results, "serpapi", answer ?? null);
  }

  private async searchDuckDuckGo(params: {
    query: string;
    fetchFullPage: boolean;
    maxResults: number;
    maxTokens: number;
  }): Promise<StructuredPayload> {
    const endpoint = new URL("https://duckduckgo.com/");
    endpoint.searchParams.set("q", params.query);

    const response = await fetch(endpoint.toString());
    if (!response.ok) {
      throw new Error(`DuckDuckGo 搜索失败: ${response.statusText}`);
    }

    const html = await response.text();
    const resultRegex = /\{"t":"(.*?)","c":"(.*?)","u":"(.*?)"\}/g;
    const results: SearchResult[] = [];
    const notices: string[] = [];

    let match: RegExpExecArray | null = null;
    while ((match = resultRegex.exec(html)) !== null) {
      const title = decodeURIComponent(match[1] ?? "");
      const content = decodeURIComponent(match[2] ?? "");
      const url = decodeURIComponent(match[3] ?? "");
      if (!url || !title) {
        notices.push("忽略不完整的 DuckDuckGo 结果");
        continue;
      }
      let rawContent: string | undefined;
      if (params.fetchFullPage) {
        const fetched = await fetchRawContent(url);
        if (fetched) {
          rawContent = limitText(fetched, params.maxTokens);
        }
      }
      results.push(normalizedResult(title, url, content, rawContent));
      if (results.length >= params.maxResults) break;
    }

    return structuredPayload(results, "duckduckgo", null, notices);
  }

  private async searchSearxng(params: {
    query: string;
    fetchFullPage: boolean;
    maxResults: number;
    maxTokens: number;
  }): Promise<StructuredPayload> {
    const host = (process.env.SEARXNG_URL ?? "http://localhost:8888").replace(/\/$/, "");
    const url = new URL(`${host}/search`);
    url.searchParams.set("q", params.query);
    url.searchParams.set("format", "json");
    url.searchParams.set("language", "zh-CN");
    url.searchParams.set("safesearch", "1");
    url.searchParams.set("categories", "general");

    const response = await fetch(url.toString(), { method: "GET" });
    if (!response.ok) {
      throw new Error(`SearXNG 搜索失败: ${response.statusText}`);
    }

    const data = (await response.json()) as SearxngResponse;
    const results: SearchResult[] = [];
    for (const entry of (data.results ?? []).slice(0, params.maxResults)) {
      const link = entry.url ?? entry.link ?? "";
      const title = entry.title ?? link;
      if (!link || !title) continue;
      let rawContent: string | undefined;
      if (params.fetchFullPage) {
        const fetched = await fetchRawContent(link);
        if (fetched) {
          rawContent = limitText(fetched, params.maxTokens);
        }
      }
      results.push(normalizedResult(title, link, entry.content ?? entry.snippet ?? "", rawContent));
    }

    return structuredPayload(results, "searxng", null);
  }

  private async searchPerplexity(params: {
    query: string;
    fetchFullPage: boolean;
    maxResults: number;
    maxTokens: number;
    loopCount: number;
  }): Promise<StructuredPayload> {
    if (!this.perplexityKey) {
      throw new Error("PERPLEXITY_API_KEY 未配置，无法使用 Perplexity 搜索");
    }

    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        Authorization: `Bearer ${this.perplexityKey}`,
      },
      body: JSON.stringify({
        model: "sonar-pro",
        messages: [
          {
            role: "system",
            content: "Search the web and provide factual information with sources.",
          },
          { role: "user", content: params.query },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Perplexity 搜索失败: ${response.statusText}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
      citations?: string[];
    };

    const content = data.choices?.[0]?.message?.content ?? "";
    const citations = data.citations?.length ? data.citations : ["https://perplexity.ai"];

    const results: SearchResult[] = [];
    citations.slice(0, params.maxResults).forEach((url, index) => {
      const snippet = index === 0 ? content : "See main Perplexity response above.";
      const raw =
        params.fetchFullPage && index === 0 ? limitText(content, params.maxTokens) : undefined;
      results.push(
        normalizedResult(
          `Perplexity Source ${params.loopCount + 1}-${index + 1}`,
          url,
          snippet,
          raw,
        ),
      );
    });

    return structuredPayload(results, "perplexity", content);
  }

  private async searchAdvanced(params: {
    query: string;
    fetchFullPage: boolean;
    maxResults: number;
    maxTokens: number;
    loopCount: number;
  }): Promise<StructuredPayload> {
    const notices: string[] = [];

    if (this.tavilyKey) {
      try {
        const tavily = await this.searchTavily(params);
        if (tavily.results.length) return tavily;
        notices.push("⚠️ Tavily 未返回有效结果，尝试其他搜索源");
      } catch (error) {
        notices.push(`⚠️ Tavily 搜索失败：${toErrorMessage(error)}`);
      }
    }

    if (this.serpapiKey) {
      try {
        const serp = await this.searchSerpapi(params);
        if (serp.results.length) {
          serp.notices = [...notices, ...(serp.notices ?? [])];
          return serp;
        }
        notices.push("⚠️ SerpApi 未返回有效结果，回退到通用搜索");
      } catch (error) {
        notices.push(`⚠️ SerpApi 搜索失败：${toErrorMessage(error)}`);
      }
    }

    try {
      const ddg = await this.searchDuckDuckGo(params);
      ddg.notices = [...notices, ...(ddg.notices ?? [])];
      return ddg;
    } catch (error) {
      notices.push(`⚠️ DuckDuckGo 搜索失败：${toErrorMessage(error)}`);
    }

    return structuredPayload([], "advanced", null, notices);
  }

  private formatTextResponse(query: string, payload: StructuredPayload): string {
    const answer = payload.answer ?? undefined;
    const notices = payload.notices ?? [];
    const results = payload.results ?? [];
    const backend = payload.backend ?? this.backend;

    const lines: string[] = [`🔍 搜索关键词：${query}`, `🧭 使用搜索源：${backend}`];
    if (answer) {
      lines.push(`💡 直接答案：${answer}`);
    }

    if (results.length) {
      lines.push("", "📚 参考来源：");
      results.forEach((item, index) => {
        lines.push(`[${index + 1}] ${item.title || item.url}`);
        if (item.content) lines.push(`    ${item.content}`);
        if (item.url) lines.push(`    来源: ${item.url}`);
        lines.push("");
      });
    } else {
      lines.push("❌ 未找到相关搜索结果。");
    }

    if (notices.length) {
      lines.push("⚠️ 注意事项：");
      notices.forEach((notice) => {
        if (notice) lines.push(`- ${notice}`);
      });
    }

    return lines.filter(Boolean).join("\n");
  }
}

export async function search(query: string, backend = "hybrid"): Promise<string> {
  const tool = new SearchTool({ backend });
  return await tool.run({ input: query, backend });
}

export async function searchTavily(query: string): Promise<string> {
  const tool = new SearchTool({ backend: "tavily" });
  return await tool.run({ input: query, backend: "tavily" });
}

export async function searchSerpapi(query: string): Promise<string> {
  const tool = new SearchTool({ backend: "serpapi" });
  return await tool.run({ input: query, backend: "serpapi" });
}

export async function searchHybrid(query: string): Promise<string> {
  const tool = new SearchTool({ backend: "hybrid" });
  return await tool.run({ input: query, backend: "hybrid" });
}
