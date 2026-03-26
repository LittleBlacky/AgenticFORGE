# @agenticforge/workflow

[![npm](https://img.shields.io/npm/v/@agenticforge/workflow)](https://www.npmjs.com/package/@agenticforge/workflow)

Standalone DAG workflow engine. Powers `WorkflowAgent` and can be used directly without an agent wrapper.

## Installation

```bash
npm install @agenticforge/workflow
```

## What's included

- `WorkflowEngine` — DAG executor with topological sort, parallel waves, branch and loop support
- All workflow types: `WorkflowDefinition`, `WorkflowNode`, `WorkflowResult`, `NodeResult`, etc.

## Node types

| Type | Description |
|------|-------------|
| `tool` | Call a registered tool; `inputTemplate` supports `{var}` interpolation |
| `llm` | Call the LLM; `promptTemplate` supports `{var}` interpolation |
| `fn` | Custom async function `(ctx, llm, registry) => string` |
| `passthrough` | Forward a context value unchanged |
| `branch` | Conditional branch: `condition(ctx)` returns branch name |
| `loop` | do-while loop over `body` sub-DAG |

## Direct usage

```ts
import { WorkflowEngine } from "@agenticforge/workflow";
import { LLMClient } from "@agenticforge/core";

const engine = new WorkflowEngine({
  llm: new LLMClient({ provider: "openai", model: "gpt-4o" }),
  verbose: true,
  maxConcurrency: 4,
});

const result = await engine.execute(
  {
    name: "bilingual-report",
    nodes: [
      { id: "fetch",     type: "tool", toolName: "search", inputTemplate: "{input}",                      depends: [] },
      { id: "analyze",   type: "llm",  promptTemplate: "Analyze:\n{fetch}",                               depends: ["fetch"] },
      { id: "translate", type: "llm",  promptTemplate: "Translate to Chinese:\n{fetch}",                  depends: ["fetch"] },
      { id: "report",    type: "llm",  promptTemplate: "Bilingual report:\n{analyze}\n\n{translate}",      depends: ["analyze", "translate"] },
    ],
  },
  "State of AI in 2026",
);

console.log(result.output);
console.log(result.nodeResults); // per-node timing and status
```

## WorkflowEngineOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `llm` | `LLMClient` | required | LLM instance |
| `registry` | `ToolRegistry` | — | Required for `tool` nodes |
| `verbose` | `boolean` | `false` | Log execution waves |
| `maxConcurrency` | `number` | unlimited | Max concurrent nodes per wave |

## Using with WorkflowAgent

For agent-wrapped usage with conversation history and hooks:

```ts
import { WorkflowAgent } from "@agenticforge/agents";
import type { WorkflowDefinition } from "@agenticforge/workflow";

const agent = new WorkflowAgent({ name: "my-workflow", llm, verbose: true });
agent.setWorkflow(definition);
const output = await agent.run("input text");
```

See the [Agents Guide](/guide/agents#workflowagent) for full WorkflowAgent documentation.
