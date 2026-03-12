<p align="center">
  <img src="assets/LOGO.png" alt="Blacky Agents SDK" width="200" />
</p>

<h3 align="center">A TypeScript SDK for building classic agent workflows with a pluggable memory system.</h3>

<p align="center">
  <a href="https://www.npmjs.com/package/blacky-agents-sdk"><img src="https://img.shields.io/npm/v/blacky-agents-sdk" alt="npm version" /></a>
  <a href="https://github.com/blacky-ai/blacky-agents-sdk/actions"><img src="https://github.com/blacky-ai/blacky-agents-sdk/actions/workflows/ci.yml/badge.svg" alt="build status" /></a>
  <a href="https://github.com/blacky-ai/blacky-agents-sdk/blob/main/LICENSE"><img src="https://img.shields.io/github/license/blacky-ai/blacky-agents-sdk" alt="license" /></a>
</p>

## Overview

Blacky Agents SDK is a framework-style TypeScript library for implementing classic agent patterns such as ReAct, Plan-and-Solve, and Reflection. It includes a composable memory subsystem (working, episodic, semantic, perceptual) with a storage adapter layer that supports in-memory, Qdrant, Neo4j, and custom backends.

## Features

- **Classic agent workflows**: ReAct, Plan-and-Solve, Reflection patterns
- **Multi-type memory model**: Working, Episodic, Semantic, Perceptual
- **Pluggable storage adapters**: KV / Vector / Graph / Blob backends
- **Built-in fallback**: Automatic degradation to in-memory adapters
- **Extensible registry**: Register custom storage backends at runtime

## Installation

```bash
pnpm add blacky-agents-sdk
# or
npm install blacky-agents-sdk
```

## Quick Start

Create a memory manager and store/retrieve semantic memory.

```ts
import {MemoryManager} from "blacky-agents-sdk/memory";

const manager = new MemoryManager({
  enableWorking: false,
  enableEpisodic: false,
  enableSemantic: true,
});

const id = await manager.addMemory({
  content: "JWT 是一种无状态认证机制，常用于前后端分离的身份校验。",
  memoryType: "semantic",
  importance: 0.8,
  autoClassify: false,
});

const results = await manager.retrieveMemories({
  query: "JWT 认证",
  limit: 3,
  memoryTypes: ["semantic"],
});

console.log(id, results.map((r) => r.content));
```

## Storage Adapters

Use adapters via factory configs or direct instance injection.

### Factory + Adapter Configs

```ts
import {MemoryManager} from "blacky-agents-sdk/memory";
import type {AdapterConfig} from "blacky-agents-sdk/memory/storage";

const adapterConfigs: AdapterConfig[] = [
  {type: "kvStore", backend: "memory"},
  {type: "vectorStore", backend: "qdrant", options: {url: "http://localhost:6333"}},
  {type: "graphStore", backend: "neo4j", options: {url: "bolt://localhost:7687", username: "neo4j", password: "password"}},
];

const manager = new MemoryManager({
  userId: "demo_user",
  enableSemantic: true,
  adapterConfigs,
});

await manager.initialize();
```

### Direct Injection

```ts
import {MemoryManager} from "blacky-agents-sdk/memory";
import {QdrantVectorStore, Neo4jGraphStore} from "blacky-agents-sdk/memory/storage";

const manager = new MemoryManager({
  enableSemantic: true,
  storageAdapters: {
    vectorStore: new QdrantVectorStore({url: "http://localhost:6333"}),
    graphStore: new Neo4jGraphStore({url: "bolt://localhost:7687", username: "neo4j", password: "password"}),
  },
});
```

## Local Dev: Qdrant + Neo4j

The repo includes a `docker-compose.yml` for spinning up Qdrant and Neo4j.

```bash
docker compose up -d
```

## Examples

- `examples/memory.adapter.demo.ts` — adapter factory usage + fallback strategy
- `examples/memory.storage.demo.ts` — Qdrant + Neo4j + blob store integration

Run an example:

```bash
pnpm example
```

## Documentation

- English: `docs/08-Memory 存储适配层架构设计文档（下）.md` — storage adapter extension & best practices
- 中文: `docs/08-Memory 存储适配层架构设计文档（下）.md` — 存储适配层扩展与最佳实践

## Contributing

Contributions are welcome. Please open an issue or pull request to discuss changes.

## License

[MIT](LICENSE)
