import "dotenv/config";
import { ReActAgent, LLMClient } from "@agenticforge/kit";
import { searchTool, ragTool, noteTool, fetchUrlTool } from "../tools/index.js";

const llm = new LLMClient({ provider: "openai", model: "gpt-4o" });

export const researcherAgent = new ReActAgent({
  llm,
  tools: [searchTool, ragTool, fetchUrlTool, noteTool],
  maxIterations: 15,
  systemPrompt: "You are a deep research assistant. Search local KB first, then web, cross-validate, cite sources.",
});

export default researcherAgent;