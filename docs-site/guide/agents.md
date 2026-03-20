# Agents

AgenticFORGE ships seven agent workflow implementations. Each wraps a different reasoning loop.

## Choosing the right agent

| Agent | Reasoning Pattern | Best For |
|-------|------------------|----------|
| `SimpleAgent` | Single LLM call | Conversation, summarization |
| `FunctionCallAgent` | Tool call → result → repeat | Task automation, API orchestration |
| `ReActAgent` | Thought → Action → Observation loop | Complex multi-step reasoning |
| `PlanSolveAgent` | Plan all steps → execute each | Long-horizon tasks, research |
| `ReflectionAgent` | Generate → Critique → Refine | High-quality writing, code review |
| `SkillAgent` | LLM-based intent routing | Multi-capability assistants |
| `WorkflowAgent` | DAG node execution, four execution modes | Enterprise automation, data pipelines |

## FunctionCallAgent

The most commonly used agent. It lets the LLM call tools via the OpenAI function-calling protocol.

```ts
import {FunctionCallAgent, LLMClient} from "@agenticforge/kit";
import {Tool, toolAction} from "@agenticforge/tools";
import {z} from "zod";

const searchTool = new Tool({
  name: "search",
  description: "Search the web for information",
  parameters: [{name: "query", type: "string", required: true}],
  action: toolAction(z.object({query: z.string()}), async ({query}) => {
    return `Results for: ${query}`;
  }),
});

const agent = new FunctionCallAgent({
  llm: new LLMClient({provider: "openai", model: "gpt-4o"}),
  tools: [searchTool],
  systemPrompt: "You are a helpful research assistant.", // optional
  maxIterations: 10, // optional, default: 10
});

const result = await agent.run("What are the latest developments in AI agents?");
console.log(result);
```

## ReActAgent

Implements the [ReAct](https://arxiv.org/abs/2210.03629) pattern: **Re**asoning + **Act**ing. The agent explicitly thinks before each action.

```ts
import {ReActAgent, LLMClient} from "@agenticforge/kit";

const agent = new ReActAgent({
  llm: new LLMClient({provider: "openai", model: "gpt-4o"}),
  tools: [/* your tools */],
  maxIterations: 15,
});

const result = await agent.run(
  "Research the top 3 vector databases and compare their performance."
);
```

## PlanSolveAgent

First creates a full plan, then executes each step. Good for tasks where upfront planning improves quality.

```ts
import {PlanSolveAgent, LLMClient} from "@agenticforge/kit";

const agent = new PlanSolveAgent({
  llm: new LLMClient({provider: "openai", model: "gpt-4o"}),
  tools: [/* your tools */],
});

const result = await agent.run(
  "Write a detailed report on the state of AI regulation in 2024."
);
```

## ReflectionAgent

Generates a response, then critiques and refines it. Useful for content quality tasks.

```ts
import {ReflectionAgent, LLMClient} from "@agenticforge/kit";

const agent = new ReflectionAgent({
  llm: new LLMClient({provider: "openai", model: "gpt-4o"}),
  reflectionRounds: 2, // how many critique-refine iterations
});

const result = await agent.run(
  "Write a concise, technical explanation of how transformers work."
);
```

## SimpleAgent

A thin wrapper around a single LLM call with optional conversation history.

```ts
import {SimpleAgent, LLMClient} from "@agenticforge/kit";

const agent = new SimpleAgent({
  llm: new LLMClient({provider: "openai", model: "gpt-4o"}),
  systemPrompt: "You are a concise technical writer.",
});

const result = await agent.run("Explain RAG in one paragraph.");
```

## WorkflowAgent

`WorkflowAgent` executes a **DAG (Directed Acyclic Graph)** of nodes with four execution modes:

| Mode | How it works |
|------|--------------|
| **Sequential** | Nodes form a linear chain via `depends`: A → B → C |
| **Parallel** | Nodes with no mutual dependencies run concurrently in the same wave |
| **Branch** | `type: "branch"` node: `condition(ctx)` returns a branch name, engine runs the matching sub-DAG |
| **Loop** | `type: "loop"` node: `body` sub-DAG runs repeatedly until `condition` returns `false` or `maxIterations` is reached (do-while) |

### Node types

| Type | Description |
|------|-------------|
| `tool` | Call a registered tool; `inputTemplate` supports `{var}` interpolation |
| `llm` | Call the LLM directly; `promptTemplate` supports `{var}` interpolation |
| `fn` | Custom async function with full context access |
| `passthrough` | Forward a context value unchanged |
| `branch` | Conditional branch: `condition(ctx)` returns a branch name, engine executes the matching sub-DAG |
| `loop` | do-while loop: execute `body` sub-DAG until `condition` returns `false` or `maxIterations` is reached |

### Linear pipeline

```ts
import {WorkflowAgent, LLMClient} from "@agenticforge/kit";
import type {WorkflowDefinition} from "@agenticforge/agents";

const agent = new WorkflowAgent({
  name: "pipeline",
  llm: new LLMClient({provider: "openai", model: "gpt-4o"}),
  registry, // ToolRegistry — required for type: "tool" nodes
  verbose: true,
});

const definition: WorkflowDefinition = {
  name: "research-report",
  nodes: [
    {id: "fetch",   type: "tool", toolName: "search", inputTemplate: "{input}",           depends: []},
    {id: "analyze", type: "llm",  promptTemplate: "Analyze:\n{fetch}",                    depends: ["fetch"]},
    {id: "report",  type: "llm",  promptTemplate: "Write a report based on:\n{analyze}",  depends: ["analyze"]},
  ],
};

const result = await agent.runWorkflow(definition, "State of AI in 2024");
console.log(result.output);
```

### Concurrent fan-out / fan-in

```ts
const definition: WorkflowDefinition = {
  name: "bilingual-report",
  nodes: [
    {id: "fetch",     type: "tool", toolName: "search", inputTemplate: "{input}",                         depends: []},
    // analyze and translate run concurrently — both depend only on fetch
    {id: "analyze",   type: "llm",  promptTemplate: "Analyze:\n{fetch}",                                  depends: ["fetch"]},
    {id: "translate", type: "llm",  promptTemplate: "Translate to Chinese:\n{fetch}",                     depends: ["fetch"]},
    // report waits for both
    {id: "report",    type: "llm",  promptTemplate: "Bilingual report:\n{analyze}\n\n{translate}",         depends: ["analyze", "translate"]},
  ],
};
```

### Conditional branch

```ts
const definition: WorkflowDefinition = {
  name: "smart-answer",
  nodes: [
    {
      id: "classify",
      type: "llm",
      promptTemplate: "Classify the question complexity, output only 'simple' or 'complex': {input}",
      depends: [],
    },
    {
      id: "router",
      type: "branch",
      condition: (ctx) => ctx["classify"].includes("complex") ? "complex" : "simple",
      branches: {
        simple:  [{id: "quick",  type: "llm", promptTemplate: "Brief answer: {input}",    depends: []}],
        complex: [{id: "detail", type: "llm", promptTemplate: "Detailed analysis: {input}", depends: []}],
      },
      depends: ["classify"],
    },
  ],
};
```

### Loop (iterative refinement)

```ts
const definition: WorkflowDefinition = {
  name: "iterative-refine",
  nodes: [
    {
      id: "refine",
      type: "loop",
      maxIterations: 3,
      // do-while: checked after each iteration; return true to continue, false to stop
      condition: (ctx, iter) => !ctx["refine"].includes("satisfied"),
      body: [
        {id: "critique", type: "llm", promptTemplate: "Critique the previous version: {refine}",   depends: []},
        {id: "improve",  type: "llm", promptTemplate: "Improve based on critique: {critique}",     depends: ["critique"]},
      ],
    },
  ],
};
// Body nodes access the previous iteration output via {refine}; empty string on first iteration
```

### Custom fn node

```ts
{
  id: "merge",
  type: "fn",
  depends: ["part1", "part2"],
  executor: async (ctx) => `Pros: ${ctx.part1}\nCons: ${ctx.part2}`,
}
```

### setWorkflow + run interface

```ts
agent.setWorkflow(definition);
const output = await agent.run("my query"); // history auto-tracked
```

### WorkflowAgent options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `llm` | `LLMClient` | required | LLM instance |
| `registry` | `ToolRegistry` | — | Required for `tool` nodes |
| `verbose` | `boolean` | `false` | Log execution waves |
| `maxConcurrency` | `number` | unlimited | Max concurrent nodes per wave |

## Using built-in tools with agents

```ts
import {FunctionCallAgent, LLMClient} from "@agenticforge/kit";
import {SearchTool, MemoryTool, NoteTool} from "@agenticforge/tools-builtin";

const agent = new FunctionCallAgent({
  llm: new LLMClient({provider: "openai", model: "gpt-4o"}),
  tools: [
    new SearchTool({backend: "tavily"}),
    new MemoryTool(),
    new NoteTool({workspace: "./notes"}),
  ],
});

const result = await agent.run(
  "Search for recent AgenticFORGE news, save key findings to memory, and write a summary note."
);
```
