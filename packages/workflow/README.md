# @agenticforge/workflow

[![npm](https://img.shields.io/npm/v/@agenticforge/workflow)](https://www.npmjs.com/package/@agenticforge/workflow)
[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)

<p><a href="./README.zh_CN.md">中文</a> | <strong>English</strong></p>

Standalone DAG workflow engine for AgenticFORGE. Powers `WorkflowAgent` and can be used directly for backend task orchestration without an agent wrapper.

## Installation

```bash
npm install @agenticforge/workflow
```

## Features

- **Sequential** — linear pipelines via `depends`
- **Parallel** — dependency-free nodes run concurrently in the same wave
- **Branch** — conditional sub-DAG routing via `condition(ctx)`
- **Loop** — do-while iteration over a body sub-DAG
- **Topological sort** — Kahn's algorithm with cycle detection
- **Concurrency cap** — `maxConcurrency` option per wave

## Node types

| Type | Description |
|------|-------------|
| `tool` | Call a registered `Tool`; `inputTemplate` supports `{var}` interpolation |
| `llm` | Call the LLM; `promptTemplate` supports `{var}` interpolation |
| `fn` | Custom async function `(ctx, llm, registry) => string` |
| `passthrough` | Forward a context value unchanged |
| `branch` | Conditional branch: `condition(ctx)` returns branch name |
| `loop` | do-while loop over `body` sub-DAG |

## Usage

### Direct usage (without WorkflowAgent)

```ts
import "dotenv/config";
import { WorkflowEngine } from "@agenticforge/workflow";
import { LLMClient } from "@agenticforge/core";

const engine = new WorkflowEngine({
  llm: new LLMClient({ provider: "openai", model: "gpt-4o" }),
  verbose: true,
});

const result = await engine.execute(
  {
    name: "summary-pipeline",
    nodes: [
      { id: "draft",  type: "llm", promptTemplate: "Draft a summary of: {input}",       depends: [] },
      { id: "refine", type: "llm", promptTemplate: "Refine this draft:\n{draft}",        depends: ["draft"] },
    ],
  },
  "The state of AI in 2026",
);

console.log(result.output);
console.log(result.nodeResults); // per-node timing and status
```

### Concurrent fan-out / fan-in

```ts
const result = await engine.execute(
  {
    name: "bilingual-report",
    nodes: [
      { id: "fetch",     type: "tool", toolName: "search", inputTemplate: "{input}",                       depends: [] },
      { id: "analyze",   type: "llm",  promptTemplate: "Analyze:\n{fetch}",                               depends: ["fetch"] },
      { id: "translate", type: "llm",  promptTemplate: "Translate to Chinese:\n{fetch}",                  depends: ["fetch"] },
      { id: "report",    type: "llm",  promptTemplate: "Bilingual report:\n{analyze}\n\n{translate}",      depends: ["analyze", "translate"] },
    ],
  },
  "AI trends 2024",
);
```

### Conditional branch

```ts
nodes: [
  { id: "classify", type: "llm", promptTemplate: "Output only 'simple' or 'complex': {input}", depends: [] },
  {
    id: "router", type: "branch",
    condition: (ctx) => ctx["classify"].includes("complex") ? "complex" : "simple",
    branches: {
      simple:  [{ id: "quick",  type: "llm", promptTemplate: "Brief answer: {input}",    depends: [] }],
      complex: [{ id: "detail", type: "llm", promptTemplate: "Detailed analysis: {input}", depends: [] }],
    },
    depends: ["classify"],
  },
]
```

### Loop (iterative refinement)

```ts
nodes: [
  {
    id: "refine", type: "loop",
    maxIterations: 3,
    condition: (ctx, iter) => !ctx["refine"].includes("satisfied"),
    body: [
      { id: "critique", type: "llm", promptTemplate: "Critique: {refine}",        depends: [] },
      { id: "improve",  type: "llm", promptTemplate: "Improve based on: {critique}", depends: ["critique"] },
    ],
  },
]
```

## WorkflowEngineOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `llm` | `LLMClient` | required | LLM instance |
| `registry` | `ToolRegistry` | — | Required for `tool` nodes |
| `verbose` | `boolean` | `false` | Log execution waves |
| `maxConcurrency` | `number` | unlimited | Max concurrent nodes per wave |

## Using with WorkflowAgent

For agent-wrapped usage (with conversation history, hooks, `run()` interface), use `WorkflowAgent` from `@agenticforge/agents`:

```ts
import { WorkflowAgent } from "@agenticforge/agents";
import type { WorkflowDefinition } from "@agenticforge/workflow";

const agent = new WorkflowAgent({
  name: "my-workflow",
  llm,
  verbose: true,
});

agent.setWorkflow(definition);
const output = await agent.run("input text");
```

## Links

- [GitHub](https://github.com/LittleBlacky/AgenticFORGE/tree/main/packages/workflow)
- [npm](https://www.npmjs.com/package/@agenticforge/workflow)
- [Root README](https://github.com/LittleBlacky/AgenticFORGE)
