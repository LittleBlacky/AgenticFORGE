import { ToolRegistry, Tool, ToolChain, AsyncToolExecutor, toolAction, SearchTool, NoteTool, MemoryTool, RagTool, TerminalTool } from "@agenticforge/kit";
import { z } from "zod";
import { ragPipeline, semanticMemory } from "../memory/index.js";

export const searchTool = new SearchTool();
export const noteTool = new NoteTool();
export const memoryTool = new MemoryTool({ memory: semanticMemory });
export const ragTool = new RagTool();
export const terminalTool = new TerminalTool();

export const fetchUrlTool = new Tool({
  name: "fetch-url",
  description: "Fetch text content from a webpage URL for knowledge capture",
  parameters: [{ name: "url", type: "string", required: true }],
  action: toolAction(
    z.object({ url: z.string().url() }),
    async ({ url }: { url: string }) => {
      try {
        const res = await fetch(url);
        const html = await res.text();
        return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 8000);
      } catch (e) {
        return `Error fetching ${url}: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  ),
});

export const ingestTool = new Tool({
  name: "ingest-knowledge",
  description: "Vectorize and store text content into the knowledge base for semantic retrieval",
  parameters: [
    { name: "content", type: "string", required: true },
    { name: "source",  type: "string", required: false },
  ],
  action: toolAction(
    z.object({ content: z.string(), source: z.string().optional() }),
    async ({ content, source }: { content: string; source?: string }) => {
      await ragPipeline.ingest([{ content, metadata: { source: source ?? "manual", timestamp: new Date().toISOString() } }]);
      return `Stored ${content.length} chars into knowledge base. Source: ${source ?? "manual"}`;
    },
  ),
});

export const captureChain = new ToolChain([fetchUrlTool, ingestTool]);
export const parallelExecutor = new AsyncToolExecutor([searchTool, ragTool]);

export const registry = new ToolRegistry();
registry.registerTool(searchTool);
registry.registerTool(noteTool);
registry.registerTool(memoryTool);
registry.registerTool(ragTool);
registry.registerTool(terminalTool);
registry.registerTool(fetchUrlTool);
registry.registerTool(ingestTool);

export default registry;