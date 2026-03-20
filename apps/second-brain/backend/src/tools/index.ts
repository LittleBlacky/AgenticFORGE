import { ToolRegistry, ToolChain, AsyncToolExecutor, SearchTool, NoteTool, MemoryTool, RagTool, TerminalTool } from "@agenticforge/kit";
import { Tool, type ToolParameter } from "@agenticforge/tools";
import { randomUUID } from "node:crypto";
import { semanticMemory } from "../memory/index.js";

export const searchTool = new SearchTool();
export const noteTool = new NoteTool();
export const memoryTool = new MemoryTool();
export const ragTool = new RagTool();
export const terminalTool = new TerminalTool();

export class FetchUrlTool extends Tool {
  constructor() {
    super("fetch-url", "Fetch text content from a webpage URL for knowledge capture");
  }
  getParameters(): ToolParameter[] {
    return [{ name: "url", type: "string", description: "URL to fetch", required: true, default: null }];
  }
  async run(params: Record<string, unknown>): Promise<string> {
    const url = String(params.url ?? "");
    try {
      const res = await fetch(url);
      const html = await res.text();
      return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 8000);
    } catch (e) {
      return `Error fetching ${url}: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
}

export class IngestTool extends Tool {
  constructor() {
    super("ingest-knowledge", "Vectorize and store text content into the knowledge base for semantic retrieval");
  }
  getParameters(): ToolParameter[] {
    return [
      { name: "content", type: "string", description: "Content to ingest", required: true, default: null },
      { name: "source",  type: "string", description: "Source identifier", required: false, default: "manual" },
    ];
  }
  async run(params: Record<string, unknown>): Promise<string> {
    const content = String(params.content ?? "");
    const source = String(params.source ?? "manual");
    await semanticMemory.add({
      id: randomUUID(),
      content,
      memoryType: "semantic",
      userId: "default",
      timestamp: new Date(),
      importance: 0.8,
      metadata: { source },
    });
    return `Stored ${content.length} chars into knowledge base. Source: ${source}`;
  }
}

export const fetchUrlTool = new FetchUrlTool();
export const ingestTool = new IngestTool();

export const captureChain = new ToolChain("capture-chain", "Fetch then ingest");
captureChain.addStep("fetch-url",        "{input}",   "fetched");
captureChain.addStep("ingest-knowledge", "{fetched}", "ingested");

export const parallelExecutor = new AsyncToolExecutor(
  (() => { const r = new ToolRegistry(); r.registerTool(searchTool); r.registerTool(ragTool); return r; })(),
  2,
);

export const registry = new ToolRegistry();
registry.registerTool(searchTool);
registry.registerTool(noteTool);
registry.registerTool(memoryTool);
registry.registerTool(ragTool);
registry.registerTool(terminalTool);
registry.registerTool(fetchUrlTool);
registry.registerTool(ingestTool);

export default registry;
