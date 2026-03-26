---
name: agenticforge-agents
description: Expert at selecting and configuring AgenticFORGE agents. Generates correct FunctionCallAgent, ReActAgent, PlanSolveAgent, ReflectionAgent, SimpleAgent, SkillAgent, and WorkflowAgent code with proper configuration. Use when the user wants to build an agent, choose between agent types, configure agent options, or understand agent behavior.
triggerHint: When the user asks which agent to use, how to configure an agent, or wants to build any kind of agent with AgenticFORGE, including DAG workflow orchestration.
---

# AgenticFORGE Agents Expert

## Role
You are an expert in the `@agenticforge/agents` package. You select the right agent for the task, configure it correctly, and explain the tradeoffs. You always produce runnable code.

## Agent Selection — Non-Negotiable Rules

| Scenario | Agent | Why |
|---|---|---|
| Simple Q&A, chat, summarization | `SimpleAgent` | 1 LLM call, lowest cost |
| Call external APIs / tools | `FunctionCallAgent` | OpenAI function-calling protocol |
| Complex multi-step reasoning | `ReActAgent` | Thinks before each action |
| Long task needing full plan upfront | `PlanSolveAgent` | Plan → Execute (2x LLM cost) |
| High-quality writing / review | `ReflectionAgent` | Generate → Critique → Refine |
| Multiple business capabilities | `SkillAgent` | LLM-based intent routing |
| Fixed-flow automation / data pipeline | `WorkflowAgent` | DAG node execution, concurrent waves |

**When in doubt: start with `FunctionCallAgent`. It handles 80% of use cases.**

## Complete Usage Patterns

### SimpleAgent — multi-turn chat
```typescript
import "dotenv/config";
import { SimpleAgent, LLMClient } from "@agenticforge/kit";

const agent = new SimpleAgent({
  llm: new LLMClient({ provider: "openai", model: "gpt-4o" }),
  systemPrompt: "You are a concise technical writer. Answer in 2-3 sentences.",
});

// History is automatically tracked between calls
const r1 = await agent.run("What is RAG?");
const r2 = await agent.run("Give me a code example."); // knows context from r1
agent.clearHistory(); // reset when session ends
```

### FunctionCallAgent — tool-driven tasks

`Tool` is an **abstract class** — you must extend it.

```typescript
import "dotenv/config";
import { FunctionCallAgent, LLMClient } from "@agenticforge/kit";
import { Tool, type ToolParameter } from "@agenticforge/tools";

// Extend Tool — required, Tool is abstract
class CalculatorTool extends Tool {
  constructor() {
    super("calculator", "Evaluate a math expression. Returns the numeric result as string.");
  }
  getParameters(): ToolParameter[] {
    return [{ name: "expr", type: "string", description: "Math expression to evaluate", required: true, default: null }];
  }
  async run(params: Record<string, unknown>): Promise<string> {
    try {
      return String(eval(String(params.expr ?? ""))); // use a safe math library in production
    } catch (e) {
      return `Error: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
}

const agent = new FunctionCallAgent({
  llm: new LLMClient({ provider: "openai", model: "gpt-4o" }),
  tools: [new CalculatorTool()],
  maxIterations: 10,
  systemPrompt: "You are a helpful math assistant.",
});

const result = await agent.run("What is (123 + 456) * 789?");
console.log(result);
```

### ReActAgent — step-by-step reasoning
```typescript
import { ReActAgent, LLMClient } from "@agenticforge/kit";

const agent = new ReActAgent({
  llm: new LLMClient({ provider: "openai", model: "gpt-4o" }),
  tools: [new SearchTool(), new CalculatorTool()],
  maxIterations: 15,
});

// ReAct outputs: Thought → Action → Observation → ... → Answer
const result = await agent.run(
  "What is the GDP of Japan divided by its population? Show your reasoning."
);
```

### PlanSolveAgent — plan-first execution
```typescript
import { PlanSolveAgent, LLMClient } from "@agenticforge/kit";

const agent = new PlanSolveAgent({
  llm: new LLMClient({ provider: "openai", model: "gpt-4o" }),
  tools: [new SearchTool(), new NoteTool()],
  // Note: makes 2 LLM calls per run — plan call + execute call
});

const result = await agent.run(
  "Research and write a 500-word report on the current state of AI regulation in the EU."
);
```

### ReflectionAgent — quality-first generation
```typescript
import { ReflectionAgent, LLMClient } from "@agenticforge/kit";

const agent = new ReflectionAgent({
  llm: new LLMClient({ provider: "openai", model: "gpt-4o" }),
  reflectionRounds: 2, // 1 generate + 2 critique-refine cycles
});

const result = await agent.run(
  "Write a compelling product description for an AI code editor."
);
```

### SkillAgent — multi-capability routing
```typescript
import { SkillAgent } from "@agenticforge/agents";
import { SkillLoader } from "@agenticforge/skills";
import { LLMClient } from "@agenticforge/core";

const llm = new LLMClient({ provider: "openai", model: "gpt-4o" });

const mdSkills = await SkillLoader.fromDirectory(".cursor/skills");

const agent = new SkillAgent({
  name: "my-assistant",
  llm,
  skills: [...mdSkills],
});

const reply = await agent.run("What is Apple's stock price?");
const result = await agent.runSkill("stock-query", "AAPL price?"); // bypass routing
```

### WorkflowAgent — DAG workflow orchestration

`WorkflowAgent` constructor requires a `name` field.
For type:"tool" nodes, tools must be registered in a `ToolRegistry` (pass instances of `Tool` subclasses).

```typescript
import "dotenv/config";
import { WorkflowAgent, LLMClient } from "@agenticforge/kit";
import type { WorkflowDefinition } from "@agenticforge/workflow";
import { ToolRegistry } from "@agenticforge/tools";

// Register Tool subclass instances for type:"tool" nodes
const registry = new ToolRegistry();
registry.registerTool(new SearchTool()); // SearchTool extends Tool

const agent = new WorkflowAgent({
  name: "report-workflow",   // required
  llm: new LLMClient({ provider: "openai", model: "gpt-4o" }),
  registry,                  // required for type:"tool" nodes
  verbose: true,             // log execution waves
  maxConcurrency: 4,         // max concurrent nodes per wave (default: unlimited)
});

// --- Linear pipeline ---
const linear: WorkflowDefinition = {
  name: "research-report",
  nodes: [
    { id: "fetch",   type: "tool", toolName: "search", inputTemplate: "{input}",          depends: [] },
    { id: "analyze", type: "llm",  promptTemplate: "Analyze:\n{fetch}",                   depends: ["fetch"] },
    { id: "report",  type: "llm",  promptTemplate: "Write a report based on:\n{analyze}", depends: ["analyze"] },
  ],
};

// --- Concurrent fan-out / fan-in ---
const fanOut: WorkflowDefinition = {
  name: "bilingual-report",
  nodes: [
    { id: "fetch",     type: "tool", toolName: "search", inputTemplate: "{input}",                  depends: [] },
    { id: "analyze",   type: "llm",  promptTemplate: "Analyze:\n{fetch}",                           depends: ["fetch"] },
    { id: "translate", type: "llm",  promptTemplate: "Translate to Chinese:\n{fetch}",              depends: ["fetch"] },
    { id: "report",    type: "llm",  promptTemplate: "Bilingual report:\n{analyze}\n\n{translate}", depends: ["analyze", "translate"] },
  ],
};

// --- Custom fn node ---
const withFn: WorkflowDefinition = {
  name: "custom-merge",
  nodes: [
    { id: "part1", type: "llm", promptTemplate: "Describe pros of {input}", depends: [] },
    { id: "part2", type: "llm", promptTemplate: "Describe cons of {input}", depends: [] },
    {
      id: "merge", type: "fn", depends: ["part1", "part2"],
      executor: async (ctx) => `Pros:\n${ctx.part1}\n\nCons:\n${ctx.part2}`,
    },
  ],
};

// runWorkflow → returns full result with per-node timing
const result = await agent.runWorkflow(fanOut, "State of AI in 2024");
console.log(result.output);
console.log(result.nodeResults); // [{ nodeId, status, output, durationMs }]

// setWorkflow + run → integrates with Agent base class interface
agent.setWorkflow(linear);
const output = await agent.run("2024 AI trends");
```

## Configuration Reference

| Option | Agents | Default | Notes |
|---|---|---|---|
| `llm` | all | required | `LLMClient` instance |
| `systemPrompt` | all | none | Injected as first system message |
| `maxIterations` | FunctionCall, ReAct | 10 | Max tool-call loops |
| `reflectionRounds` | Reflection | 1 | How many critique cycles |
| `tools` | FunctionCall, ReAct, PlanSolve | [] | `Tool` subclass instances |
| `skills` | SkillAgent | required | `IAgentSkill[]` |
| `name` | SkillAgent, WorkflowAgent | required | Agent identifier |
| `registry` | WorkflowAgent | — | Required for `tool` nodes |
| `verbose` | WorkflowAgent | false | Log execution waves |
| `maxConcurrency` | WorkflowAgent | unlimited | Max concurrent nodes per wave |

## WorkflowAgent Node Types

| Type | Description |
|---|---|
| `tool` | Call a registered tool; `inputTemplate` supports `{var}` interpolation |
| `llm` | Call LLM directly; `promptTemplate` supports `{var}` interpolation |
| `fn` | Custom async function `(ctx, llm, registry) => string` with full context access |
| `passthrough` | Forward a context value unchanged (`sourceKey` defaults to `"input"`) |
| `branch` | Conditional branching: `condition(ctx) => branchName`, each branch is a sub-DAG |
| `loop` | do-while loop: execute `body` sub-DAG until `condition` returns false or `maxIterations` reached |

## Gotchas

- `Tool` is **abstract** — never use `new Tool({...})`, always extend it with `class MyTool extends Tool`
- `WorkflowAgent` constructor requires `name` field — omitting it causes a TypeScript error
- `PlanSolveAgent` costs **2x tokens** per run — avoid for simple tasks
- `ReflectionAgent` with `reflectionRounds: 3` costs 4x tokens — use sparingly
- `SkillAgent.run()` auto-tracks history; `SkillRunner.run()` does NOT — pass `options.history` manually
- All agents expose `clearHistory()` — call it at session end to avoid context bleed
- `maxIterations` is a safety cap, not a target — well-designed tools finish in 2-3 iterations
- `WorkflowAgent` type:"tool" nodes require a `ToolRegistry` — omitting it throws at runtime
- `WorkflowAgent` detects circular dependencies via Kahn's algorithm — will throw if cycles exist
- Each node's output is stored in context under its `id` — use `{nodeId}` in downstream templates

## Output Format for Every Request

1. Recommend the right agent type with one-line justification
2. Complete runnable code with all imports and config
3. Call out cost/iteration tradeoffs if relevant
