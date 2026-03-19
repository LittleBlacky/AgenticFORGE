# @agenticforge/memory

[![npm](https://img.shields.io/npm/v/@agenticforge/memory)](https://www.npmjs.com/package/@agenticforge/memory)
[![license](https://img.shields.io/github/license/LittleBlacky/AgenticFORGE)](https://github.com/LittleBlacky/AgenticFORGE/blob/main/LICENSE)

<p><a href="./README.zh_CN.md">中文</a> | <strong>English</strong></p>

Multi-type memory manager, pluggable storage adapters, and RAG pipeline for AgenticFORGE.

## Installation

```bash
npm install @agenticforge/memory
```

### Sub-path imports (tree-shakeable, v1.1.0+)

```ts
import {MemoryManager} from "@agenticforge/memory/manager";          // 7.6 KB
import {createRagPipeline} from "@agenticforge/memory/rag";           // RAG only
import {QdrantVectorStore} from "@agenticforge/memory/storage";       // storage only
import {createDefaultTextEmbedder} from "@agenticforge/memory/embedding";
```

## Memory Types

| Type | Description |
|------|-------------|
| `working` | Short-term context �?session-scoped |
| `episodic` | Historical events with timestamps and importance scores |
| `semantic` | Knowledge and concepts �?supports vector retrieval |
| `perceptual` | Temporary buffer for raw inputs and outputs |

## Usage

```ts
import {MemoryManager} from "@agenticforge/memory";

const memory = new MemoryManager({
  enableWorking: true,
  enableEpisodic: true,
  enableSemantic: true,
});

await memory.addMemory({
  content: "User prefers dark theme",
  memoryType: "semantic",
  importance: 0.8,
});

const results = await memory.retrieveMemories({
  query: "UI preferences",
  limit: 3,
  memoryTypes: ["semantic"],
});
```

## Connect to Qdrant + Neo4j

```ts
const memory = new MemoryManager({
  enableSemantic: true,
  adapterConfigs: [
    {type: "vectorStore", backend: "qdrant", options: {url: "http://localhost:6333"}},
    {type: "graphStore", backend: "neo4j", options: {
      url: "bolt://localhost:7687",
      username: "neo4j",
      password: "password",
    }},
  ],
});
await memory.initialize();
```

## Links

- [GitHub](https://github.com/LittleBlacky/AgenticFORGE/tree/main/packages/memory)
- [npm](https://www.npmjs.com/package/@agenticforge/memory)
- [Root README](https://github.com/LittleBlacky/AgenticFORGE)
