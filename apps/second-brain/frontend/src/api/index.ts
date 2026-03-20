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
