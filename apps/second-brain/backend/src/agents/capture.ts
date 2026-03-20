import "dotenv/config";
import { FunctionCallAgent, WorkflowAgent, LLMClient } from "@agenticforge/kit";
import { registry, fetchUrlTool, ingestTool, noteTool, ragTool } from "../tools/index.js";
import type { WorkflowDefinition } from "@agenticforge/kit";

const llm = new LLMClient();

export const captureAgent = new FunctionCallAgent({
  name: "capture",
  llm,
  tools: [fetchUrlTool, ingestTool, noteTool, ragTool],
  maxToolIterations: 8,
  systemPrompt: "You are a knowledge capture assistant. For URL: fetch then ingest. For text: extract and ingest. Always report what was captured.",
});

export const captureWorkflowAgent = new WorkflowAgent({ name: "capture-workflow", llm, registry, verbose: true, maxConcurrency: 3 });

export const capturePipelineDefinition: WorkflowDefinition = {
  name: "knowledge-capture-pipeline",
  nodes: [
    { id: "fetch",     type: "tool", toolName: "fetch-url",        inputTemplate: "{input}",           depends: [] },
    { id: "summarize", type: "llm",  promptTemplate: "Summarize in 200 words and extract keywords:\n\n{fetch}", depends: ["fetch"] },
    { id: "ingest",    type: "tool", toolName: "ingest-knowledge", inputTemplate: "{summarize}",      depends: ["summarize"] },
    { id: "note",      type: "tool", toolName: "note",             inputTemplate: "Summary: {summarize}", depends: ["summarize"] },
  ],
};

export default captureAgent;
