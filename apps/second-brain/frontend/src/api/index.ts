const BASE = "/api";

export interface ChatResponse {
  output: string;
  agent: string;
  skillUsed?: string;
}

export interface SearchResult {
  content: string;
  metadata?: Record<string, unknown>;
  score?: number;
}

export interface MemoryStats {
  working?: unknown;
  episodic?: unknown;
  semantic?: unknown;
}

// ── 流式 chat — 返回 AsyncGenerator，逐 token yield ──────────────────────
export type StreamChunk =
  | { type: "token";  token: string }
  | { type: "meta";   agent: string; skillUsed: string }
  | { type: "error";  message: string }
  | { type: "done" };

export async function* chatStream(
  message: string,
  signal?: AbortSignal,
): AsyncGenerator<StreamChunk> {
  const res = await fetch(`${BASE}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(await res.text());

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    // SSE 帧以 \n\n 分隔
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      const json = line.slice(5).trim();
      if (!json) continue;
      try {
        yield JSON.parse(json) as StreamChunk;
      } catch { /* skip malformed */ }
    }
  }
}

export async function chat(message: string): Promise<ChatResponse> {
  const res = await fetch(`${BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function ingestUrl(url: string): Promise<{ output: string }> {
  const res = await fetch(`${BASE}/ingest/url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function ingestText(content: string, source?: string): Promise<{ success: boolean }> {
  const res = await fetch(`${BASE}/ingest/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, source }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function semanticSearch(q: string, topK = 5): Promise<{ results: SearchResult[] }> {
  const res = await fetch(`${BASE}/search?q=${encodeURIComponent(q)}&topK=${topK}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function generateWeeklyReport(): Promise<{ report: string }> {
  const res = await fetch(`${BASE}/insight/weekly`, { method: "POST" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getMemoryStats(): Promise<MemoryStats> {
  const res = await fetch(`${BASE}/memory/stats`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
