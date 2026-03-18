# @agenticforge/kit

[![npm](https://img.shields.io/npm/v/@agenticforge/kit)](https://www.npmjs.com/package/@agenticforge/kit)
[![license](https://img.shields.io/github/license/LittleBlacky/AgenticFORGE)](https://github.com/LittleBlacky/AgenticFORGE/blob/main/LICENSE)

All-in-one entry point for AgenticFORGE — install once, use everything.

## Installation

```bash
npm install @agenticforge/kit
# or
pnpm add @agenticforge/kit
```

## What's Included

`@agenticforge/kit` re-exports everything from all sub-packages:

| Package | Contents |
|---------|----------|
| `@agenticforge/core` | Core types, LLM client |
| `@agenticforge/tools` | Tool abstraction, Registry, Chain |
| `@agenticforge/agents` | ReAct / Plan-Solve / Reflection / FunctionCall / Simple |
| `@agenticforge/memory` | Multi-type memory manager, RAG, storage adapters |
| `@agenticforge/tools-builtin` | Built-in tools: search, memory, notes, RAG, terminal |
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

// LLM client
const llm = new LLMClient({provider: "openai", model: "gpt-4o"});

// Custom tool
const greetTool = new Tool({
  name: "greet",
  description: "Greet a user by name",
  parameters: [{name: "name", type: "string", description: "User name", required: true}],
  action: toolAction(z.object({name: z.string()}), async ({name}) => {
    return `Hello, ${name}!`;
  }),
});

// Agent with built-in + custom tools
const agent = new FunctionCallAgent({
  llm,
  tools: [greetTool, new SearchTool()],
});

const result = await agent.run("Greet Alice and then search for AgenticFORGE.");
console.log(result);
```

## Individual Package Imports

For smaller bundles, import from individual sub-packages directly:

```ts
// Only includes MemoryManager — no qdrant/neo4j/openai
import {MemoryManager} from "@agenticforge/memory/manager";

// Only RAG pipeline
import {createRagPipeline} from "@agenticforge/memory/rag";

// Only storage adapters
import {QdrantVectorStore} from "@agenticforge/memory/storage";
```

## Links

- [GitHub](https://github.com/LittleBlacky/AgenticFORGE/tree/main/packages/kit)
- [npm](https://www.npmjs.com/package/@agenticforge/kit)
- [Root README](https://github.com/LittleBlacky/AgenticFORGE)
