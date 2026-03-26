# @agenticforge/kit

[![npm](https://img.shields.io/npm/v/@agenticforge/kit)](https://www.npmjs.com/package/@agenticforge/kit)

All-in-one entry point for AgenticFORGE — install once, use everything.

## Installation

```bash
npm install @agenticforge/kit
```

## What's included

| Package | Contents |
|---------|----------|
| `@agenticforge/core` | Core types, LLM client |
| `@agenticforge/tools` | Tool abstraction, Registry, Chain |
| `@agenticforge/agents` | 5 agent workflow implementations |
| `@agenticforge/memory` | Multi-type memory manager, RAG, storage |
| `@agenticforge/tools-builtin` | Search, memory, notes, RAG, terminal tools |
| `@agenticforge/context` | Token-aware context builder |
| `@agenticforge/utils` | LRU cache, prompt utilities |

## Usage

```ts
import {
  LLMClient,
  FunctionCallAgent,
  Tool,
  toolAction,
  MemoryManager,
  ContextBuilder,
  SearchTool,
} from "@agenticforge/kit";
import {z} from "zod";

const llm = new LLMClient({provider: "openai", model: "gpt-4o"});

const greetTool = new Tool({
  name: "greet",
  description: "Greet a user by name",
  parameters: [{name: "name", type: "string", required: true}],
  action: toolAction(z.object({name: z.string()}), async ({name}) => {
    return `Hello, ${name}!`;
  }),
});

const agent = new FunctionCallAgent({
  llm,
  tools: [greetTool, new SearchTool()],
});

const result = await agent.run("Greet Alice and search for AgenticFORGE.");
console.log(result);
```

## Tree-shakeable sub-paths

For smaller bundles, import directly from sub-packages:

```ts
import {MemoryManager} from "@agenticforge/memory/manager"; // 7.6 KB
import {createRagPipeline} from "@agenticforge/memory/rag";  // 30 KB
```
