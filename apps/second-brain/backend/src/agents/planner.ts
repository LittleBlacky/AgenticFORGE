import "dotenv/config";
import { PlanSolveAgent, LLMClient } from "@agenticforge/kit";
import { searchTool, ragTool, noteTool } from "../tools/index.js";

const llm = new LLMClient({ provider: "openai", model: "gpt-4o" });

export const plannerAgent = new PlanSolveAgent({
  llm,
  tools: [searchTool, ragTool, noteTool],
  systemPrompt: "You are a task planning assistant. Break complex goals into steps, execute each with tools, record results, and summarize.",
});

export default plannerAgent;