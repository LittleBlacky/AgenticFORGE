# @agenticforge/agents

[![npm](https://img.shields.io/npm/v/@agenticforge/agents)](https://www.npmjs.com/package/@agenticforge/agents)
[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)

<p><a href="./README.zh_CN.md">中文</a> | <strong>English</strong></p>

Built-in agent implementations for AgenticFORGE — from a simple chatbot to a multi-skill assistant to a concurrent DAG workflow engine.

## Installation

```bash
npm install @agenticforge/agents
```

---

## Choosing the Right Agent

| Agent | When to use it |
|-------|----------------|
| `SimpleAgent` | Conversation without tool access — summarization, Q&A, writing |
| `FunctionCallAgent` | Needs to call APIs or tools reliably |
| `ReActAgent` | Complex multi-step reasoning where the agent must think before acting |
| `PlanSolveAgent` | Long tasks that benefit from an explicit plan before execution |
| `ReflectionAgent` | High-quality output that needs self-critique and refinement |
| `SkillAgent` | Multiple distinct capabilities — route each query to the right specialist |
| `WorkflowAgent` | Fixed automation pipelines with parallelizable steps |

---

## SimpleAgent — Conversational Assistant

The most lightweight agent. No tools, no loops — just multi-turn conversation with history.

```ts
import { SimpleAgent, LLMClient } from "@agenticforge/agents";

const agent = new SimpleAgent({
  name: "support-bot",
  llm: new LLMClient({ provider: "openai", model: "gpt-4o" }),
  systemPrompt: "You are a friendly customer support agent. Keep answers concise.",
});

const r1 = await agent.run("I haven't received my order from last week.");
const r2 = await agent.run("The order number is #98234."); // history is maintained
const r3 = await agent.run("Can I get a refund?");

agent.clearHistory(); // reset between sessions
```

---

## FunctionCallAgent — Tool-Driven Tasks

Use this when the agent needs to call external APIs or run functions. It loops through tool calls until it has enough information to produce a final answer.

```ts
import { FunctionCallAgent, LLMClient } from "@agenticforge/agents";
import { Tool, type ToolParameter } from "@agenticforge/tools";

class FlightStatusTool extends Tool {
  constructor() {
    super("check_flight", "Check the live status of a flight by its flight number.");
  }
  getParameters(): ToolParameter[] {
    return [{ name: "flight_number", type: "string", description: "e.g. AA123", required: true, default: null }];
  }
  async run(params: Record<string, unknown>): Promise<string> {
    const flight = String(params.flight_number);
    return `Flight ${flight}: On time, departs 14:30, gate B12`;
  }
}

const agent = new FunctionCallAgent({
  name: "travel-assistant",
  llm: new LLMClient({ provider: "openai", model: "gpt-4o" }),
  tools: [new FlightStatusTool()],
  systemPrompt: "You are a helpful travel assistant.",
  maxIterations: 5,
});

const result = await agent.run("Is my flight AA456 on time?");
// => "Your flight AA456 is on time! Departs at 14:30 from gate B12."
```

---

## ReActAgent — Reasoning + Action

The ReAct agent explicitly reasons before each action: Thought → Action → Observation → repeat. Best for tasks where the solution path is not known upfront.

```ts
import { ReActAgent, LLMClient } from "@agenticforge/agents";

const agent = new ReActAgent({
  name: "research-agent",
  llm: new LLMClient({ provider: "openai", model: "gpt-4o" }),
  tools: [new WebSearchTool(), new CalculatorTool()],
  maxIterations: 15,
});

// The agent will search, reason about what it found, search again if needed,
// then synthesize a final answer
const result = await agent.run(
  "What was the GDP growth rate of Vietnam in 2023, and how does it compare to the ASEAN average?"
);
```

---

## PlanSolveAgent — Plan First, Execute Second

For longer tasks, `PlanSolveAgent` first produces a step-by-step plan, then executes it. This reduces hallucination on complex multi-part tasks.

```ts
import { PlanSolveAgent, LLMClient } from "@agenticforge/agents";

const agent = new PlanSolveAgent({
  name: "report-writer",
  llm: new LLMClient({ provider: "openai", model: "gpt-4o" }),
  tools: [new WebSearchTool()],
});

const result = await agent.run(
  "Research EU AI regulation in 2024 and write a 600-word summary."
);
```

> Makes **2 LLM calls per run** (plan + execute). Avoid for simple tasks.

---

## ReflectionAgent — Self-Critique Loop

Generates an answer, critiques it, then refines it. Best for writing tasks where quality matters more than speed.

```ts
import { ReflectionAgent, LLMClient } from "@agenticforge/agents";

const agent = new ReflectionAgent({
  name: "copywriter",
  llm: new LLMClient({ provider: "openai", model: "gpt-4o" }),
  reflectionRounds: 2,
  systemPrompt: "You are an expert product copywriter.",
});

const result = await agent.run(
  "Write a 3-sentence product description for a noise-cancelling AI earphone."
);
// Draft generated → critiqued → rewritten → critiqued → rewritten
```

> `reflectionRounds: 2` costs **3x tokens**. Use sparingly.

---

## SkillAgent — Multi-Capability Routing

Routes each user query to the most appropriate registered Skill. Uses **keyword rule routing** (zero LLM cost) first, then **LLM intent routing** as fallback.

Ideal when you have distinct capabilities that should not interfere — billing, shipping, and technical support as separate skills.

```ts
import { SkillAgent } from "@agenticforge/agents";
import { SkillLoader, AgentSkill } from "@agenticforge/skills";

const mdSkills = await SkillLoader.fromDirectory("./skills");

const agent = new SkillAgent({
  name: "ecommerce-support",
  llm,
  skills: [...mdSkills, new OrderLookupSkill()],
  fallbackPrompt: "You are a helpful e-commerce support agent.",
});

await agent.run("When will my order arrive?");         // => shipping-info skill
await agent.run("I was charged twice.");               // => billing-support skill
await agent.run("What's your return policy?");         // => return-policy skill
await agent.run("Order #12345 status?");               // => OrderLookupSkill

// Call a specific skill directly (bypasses routing)
await agent.runSkill("order-lookup", "Track order #99887");
```

---

## withSkills — Add Skills to Any Agent

`withSkills` layers Skill routing onto **any** agent type. Skill routing runs first; if nothing matches, the original agent logic takes over unchanged.

```ts
import { ReActAgent, withSkills } from "@agenticforge/agents";

// A research agent that also handles domain FAQ via skills
const ResearchWithSkills = withSkills(ReActAgent);

const agent = new ResearchWithSkills({
  name: "smart-researcher",
  llm,
  tools: [new WebSearchTool(), new CalculatorTool()],
  maxIterations: 12,
});

await agent.loadSkillsFromDir("./domain-skills");

// FAQ query → hits skill directly (zero LLM routing cost)
await agent.run("What are your data retention policies?");

// Complex research query → falls through to ReAct loop
await agent.run("Compare TSMC and Samsung revenue in Q3 2024.");
```

**Methods added by `withSkills`:**

| Method | Description |
|--------|-------------|
| `addSkill(skill)` | Register a skill |
| `removeSkill(name)` | Unregister a skill |
| `listSkills()` | List registered skill names |
| `loadSkillsFromDir(dir)` | Batch-load `SKILL.md` files from a directory |
| `getDispatcher()` | Access the underlying `SkillDispatcher` |
| `skillRegistry` | Direct access to the `SkillRegistry` |

---

## WorkflowAgent — DAG Pipelines

Executes a directed acyclic graph of nodes. Nodes without mutual dependencies run concurrently.

```ts
import { WorkflowAgent, LLMClient } from "@agenticforge/agents";
import type { WorkflowDefinition } from "@agenticforge/workflow";

// Competitive analysis: fetch two companies in parallel, analyze in parallel, then synthesize
const agent = new WorkflowAgent({
  name: "competitive-analysis",
  llm: new LLMClient({ provider: "openai", model: "gpt-4o" }),
  verbose: true,
});

const workflow: WorkflowDefinition = {
  name: "competitor-report",
  nodes: [
    { id: "fetch_a",   type: "tool", toolName: "search", inputTemplate: "{input} company financials",      depends: [] },
    { id: "fetch_b",   type: "tool", toolName: "search", inputTemplate: "{input} competitor financials",   depends: [] },
    { id: "analyze_a", type: "llm",  promptTemplate: "Analyze: {fetch_a}",                                  depends: ["fetch_a"] },
    { id: "analyze_b", type: "llm",  promptTemplate: "Analyze: {fetch_b}",                                  depends: ["fetch_b"] },
    { id: "report",    type: "llm",  promptTemplate: "Write a comparative report:\n{analyze_a}\n{analyze_b}", depends: ["analyze_a", "analyze_b"] },
  ],
};

// fetch_a and fetch_b run concurrently
// analyze_a and analyze_b run concurrently after their respective fetches
// report runs last
const result = await agent.runWorkflow(workflow, "TSMC vs Samsung");
console.log(result.output);
console.log(result.nodeResults); // per-node timing and status
```

Supported node types: `tool` · `llm` · `fn` · `passthrough` · `branch` · `loop`

---

## Links

- [GitHub](https://github.com/LittleBlacky/AgenticFORGE/tree/main/packages/agents)
- [npm](https://www.npmjs.com/package/@agenticforge/agents)
- [Root README](https://github.com/LittleBlacky/AgenticFORGE)
