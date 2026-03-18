# @agenticforge/kit

[![npm](https://img.shields.io/npm/v/@agenticforge/kit)](https://www.npmjs.com/package/@agenticforge/kit)
[![license](https://img.shields.io/github/license/LittleBlacky/AgenticFORGE)](https://github.com/LittleBlacky/AgenticFORGE/blob/main/LICENSE)

<p><a href="./README.en.md">中文</a> | <strong>English</strong></p>

All-in-one entry point for AgenticFORGE — install once, use everything.

## Installation

```bash
npm install @agenticforge/kit
# or
pnpm add @agenticforge/kit
```

## What's Included

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
  SearchTool,
} from "@agenticforge/kit";
import {z} from "zod";

const agent = new FunctionCallAgent({
  llm: new LLMClient({provider: "openai", model: "gpt-4o"}),
  tools: [new SearchTool()],
});

const result = await agent.run("Search for AgenticFORGE updates.");
console.log(result);
```

## Tree-shakeable Sub-paths

```ts
import {MemoryManager} from "@agenticforge/memory/manager"; // 7.6 KB
import {createRagPipeline} from "@agenticforge/memory/rag";  // 30 KB
```

## Links

- [GitHub](https://github.com/LittleBlacky/AgenticFORGE/tree/main/packages/kit)
- [npm](https://www.npmjs.com/package/@agenticforge/kit)
- [Root README](https://github.com/LittleBlacky/AgenticFORGE)
