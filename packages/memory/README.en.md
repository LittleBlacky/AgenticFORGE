# @agenticforge/memory

[![npm](https://img.shields.io/npm/v/@agenticforge/memory)](https://www.npmjs.com/package/@agenticforge/memory)
[![license](https://img.shields.io/github/license/LittleBlacky/AgenticFORGE)](https://github.com/LittleBlacky/AgenticFORGE/blob/main/LICENSE)

Multi-type memory manager, pluggable storage adapters, and RAG pipeline for AgenticFORGE.

## Installation

```bash
npm install @agenticforge/memory
```

### Sub-path imports (tree-shakeable, v1.1.0+)

```ts
// Only download what you need
import {MemoryManager} from "@agenticforge/memory/manager";    // 7.6 KB — no qdrant/neo4j
import {createRagPipeline} from "@agenticforge/memory/rag";    // RAG pipeline only
import {QdrantVectorStore} from "@agenticforge/memory/storage"; // storage adapters only
import {createDefaultTextEmbedder} from "@agenticforge/memory/embedding";
```

## Memory Types

| Type | Description |
|------|-------------|
| `working` | Short-term context — session-scoped |
| `episodic` | Historical events with timestamps and importance scores |
| `semantic` | Knowledge and concepts — supports vector retrieval |
| `perceptual` | Temporary buffer for raw inputs and outputs |

## Usage

### Basic memory operations

```ts
import {MemoryManager} from "@agenticforge/memory";

const memory = new MemoryManager({
  enableWorking: true,
  enableEpisodic: true,
  enableSemantic: true,
});

// Store
await memory.addMemory({
  content: "User prefers dark theme",
  memoryType: "semantic",
  importance: 0.8,
});

// Retrieve
const results = await memory.retrieveMemories({
  query: "UI preferences",
  limit: 3,
  memoryTypes: ["semantic"],
});
```

### Connect to Qdrant + Neo4j

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

### RAG pipeline

```ts
import {createRagPipeline} from "@agenticforge/memory/rag";

const rag = createRagPipeline({ragNamespace: "docs"});

// Index documents
await rag.addDocuments(["./guide.md", "./api.md"]);

// Search
const hits = await rag.search("how to configure memory", 5);
```

## Links

- [GitHub](https://github.com/LittleBlacky/AgenticFORGE/tree/main/packages/memory)
- [npm](https://www.npmjs.com/package/@agenticforge/memory)
- [Root README](https://github.com/LittleBlacky/AgenticFORGE)
