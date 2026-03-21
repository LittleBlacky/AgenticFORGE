# @agenticforge/agents

[![npm](https://img.shields.io/npm/v/@agenticforge/agents)](https://www.npmjs.com/package/@agenticforge/agents)
[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)



<p><a href="./README.zh_CN.md">中文</a> | <strong>English</strong></p>

Classic agent workflow implementations for AgenticFORGE — ReAct, Plan-and-Solve, Reflection, FunctionCall, Simple, SkillAgent, and WorkflowAgent.

## Installation

```bash
npm install @agenticforge/agents
```

## Built-in Agents

| Agent | Best For |
|-------|----------|
| `SimpleAgent` | Single-turn or multi-turn conversation without tools |
| `FunctionCallAgent` | Tool-driven task execution |
| `ReActAgent` | Reasoning-action loops for complex reasoning tasks |
| `PlanSolveAgent` | Plan first, then execute step by step |
| `ReflectionAgent` | Self-critique loop for high-quality generation |
| `SkillAgent` | Multi-capability routing via Skills |
| `WorkflowAgent` | DAG-based workflow orchestration with concurrent nodes |

## Usage

```ts
import {FunctionCallAgent, LLMClient} from "@agenticforge/agents";
import {Tool, toolAction} from "@agenticforge/tools";
import {z} from "zod";

const calcTool = new Tool({
  name: "calculator",
  description: "Evaluate a math expression",
  parameters: [{name: "expr", type: "string", required: true}],
  action: toolAction(z.object({expr: z.string()}), async ({expr}) => String(eval(expr))),
});

const agent = new FunctionCallAgent({
  llm: new LLMClient({provider: "openai", model: "gpt-4o"}),
  tools: [calcTool],
});

const result = await agent.run("What is (123 + 456) * 2?");
console.log(result);
```

## SkillAgent

`SkillAgent` routes each user query to the most appropriate registered Skill. Skills can be defined as Markdown files or TypeScript classes — see [@agenticforge/skills](https://www.npmjs.com/package/@agenticforge/skills).

```ts
import { SkillAgent } from "@agenticforge/agents";
import { AgentSkill, SkillLoader } from "@agenticforge/skills";

// Load Markdown skills from a directory
const mdSkills = await SkillLoader.fromDirectory(".cursor/skills");

// Mix with TypeScript skills
const agent = new SkillAgent({
  name: "assistant",
  llm,
  skills: [...mdSkills, new StockSkill()],
});

// Auto-routes to the best skill
const reply = await agent.run("Is it raining in Tokyo?");

// Call a specific skill directly
const result = await agent.runSkill("stock-query", "Apple stock price?");
console.log(result.output);
```

## WorkflowAgent

`WorkflowAgent` executes a DAG of nodes. Nodes without mutual dependencies run concurrently; each node's output is stored in a shared context and can be referenced by downstream nodes via `{nodeId}` interpolation.

Supported node types: `tool` · `llm` · `fn` · `passthrough`

```ts
import { WorkflowAgent, LLMClient } from "@agenticforge/agents";
import type { WorkflowDefinition } from "@agenticforge/agents";

const agent = new WorkflowAgent({
  name: "report-workflow",
  llm: new LLMClient({ provider: "openai", model: "gpt-4o" }),
  verbose: true,
});

const definition: WorkflowDefinition = {
  name: "fan-out-report",
  nodes: [
    { id: "fetch",     type: "tool", toolName: "search", inputTemplate: "{input}",                        depends: [] },
    { id: "analyze",   type: "llm",  promptTemplate: "Analyze:\n{fetch}",                                 depends: ["fetch"] },
    { id: "translate", type: "llm",  promptTemplate: "Translate to English:\n{fetch}",                    depends: ["fetch"] },
    { id: "report",    type: "llm",  promptTemplate: "Write a bilingual report:\n{analyze}\n{translate}",  depends: ["analyze", "translate"] },
  ],
};

// analyze and translate run concurrently after fetch completes
const result = await agent.runWorkflow(definition, "State of AI in 2024");
console.log(result.output);
console.log(result.nodeResults); // per-node timing and status
```

## Links

- [GitHub](https://github.com/LittleBlacky/AgenticFORGE/tree/main/packages/agents)
- [npm](https://www.npmjs.com/package/@agenticforge/agents)
- [Root README](https://github.com/LittleBlacky/AgenticFORGE)
