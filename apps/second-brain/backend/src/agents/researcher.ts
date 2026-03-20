import "dotenv/config";
import { ReActAgent, LLMClient } from "@agenticforge/kit";
import { ToolRegistry } from "@agenticforge/tools";
import { searchTool, ragTool, noteTool, fetchUrlTool } from "../tools/index.js";

const llm = new LLMClient();

const researchRegistry = new ToolRegistry();
researchRegistry.registerTool(searchTool);
researchRegistry.registerTool(ragTool);
researchRegistry.registerTool(fetchUrlTool);
researchRegistry.registerTool(noteTool);

export const researcherAgent = new ReActAgent({
  name: "researcher",
  llm,
  toolRegistry: researchRegistry,
  maxSteps: 15,
  systemPrompt: "You are a deep research assistant. Search local KB first, then web, cross-validate, cite sources.",
});

export default researcherAgent;
