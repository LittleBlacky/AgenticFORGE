# @agenticforge/memory

[![npm](https://img.shields.io/npm/v/@agenticforge/memory)](https://www.npmjs.com/package/@agenticforge/memory)

Multi-type memory manager, pluggable storage adapters, and RAG pipeline.

## Installation

```bash
npm install @agenticforge/memory
```

## Sub-path imports (v1.1.0+)

```ts
import {MemoryManager} from "@agenticforge/memory/manager";          // 7.6 KB
import {createRagPipeline} from "@agenticforge/memory/rag";           // 30 KB
import {QdrantVectorStore} from "@agenticforge/memory/storage";       // 8 KB
import {createDefaultTextEmbedder} from "@agenticforge/memory/embedding"; // 0.6 KB
```

## Memory types

| Type | Scope | Use Case |
|------|-------|----------|
| `working` | Session | Current task context |
| `episodic` | Long-term | Past events, history |
| `semantic` | Long-term | Facts, knowledge, preferences |
| `perceptual` | Short-term | Raw inputs (images, audio) |

See the [Memory Guide](/guide/memory) for detailed usage and storage configuration.
