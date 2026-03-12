<p align="center">
  <img src="assets/LOGO.png" alt="Blacky Agents SDK" width="200" />
</p>

<h3 align="center">用于构建经典 Agent 工作流与可插拔记忆系统的 TypeScript SDK。</h3>

<p align="center">
  <a href="https://www.npmjs.com/package/blacky-agents-sdk"><img src="https://img.shields.io/npm/v/blacky-agents-sdk" alt="npm version" /></a>
  <a href="https://github.com/blacky-ai/blacky-agents-sdk/actions"><img src="https://github.com/blacky-ai/blacky-agents-sdk/actions/workflows/ci.yml/badge.svg" alt="build status" /></a>
  <a href="https://github.com/blacky-ai/blacky-agents-sdk/blob/main/LICENSE"><img src="https://img.shields.io/github/license/blacky-ai/blacky-agents-sdk" alt="license" /></a>
</p>

<p align="center">
  <a href="README.md">English</a> · 中文
</p>

## 概述

Blacky Agents SDK 是一个框架式 TypeScript 库，用于实现经典的 Agent 模式（ReAct、Plan-and-Solve、Reflection）。内置可组合的多类型记忆系统（工作记忆、情景记忆、语义记忆、感知记忆），并提供存储适配层，支持内存、Qdrant、Neo4j 以及自定义后端。

## 特性

- **经典 Agent 工作流**：ReAct、Plan-and-Solve、Reflection
- **多类型记忆模型**：工作 / 情景 / 语义 / 感知
- **可插拔存储适配**：KV / 向量 / 图 / Blob 后端
- **内置降级策略**：外部存储不可用时自动回退到内存
- **注册式扩展**：运行时注册自定义后端

## 安装

```bash
pnpm add blacky-agents-sdk
# or
npm install blacky-agents-sdk
```

## 快速开始

创建 MemoryManager 并写入/检索语义记忆。

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

## 存储适配器

支持工厂配置或直接注入实例。

### 工厂 + 配置

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

### 直接注入

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

## 本地开发：Qdrant + Neo4j

仓库内提供 `docker-compose.yml`，可直接启动 Qdrant 与 Neo4j。

```bash
docker compose up -d
```

## 示例

- `examples/memory.adapter.demo.ts` — 适配器工厂用法 + 降级策略
- `examples/memory.storage.demo.ts` — Qdrant + Neo4j + Blob 存储集成

运行示例：

```bash
pnpm example
```

## 文档

- `docs/08-Memory 存储适配层架构设计文档（下）.md` — 存储适配层扩展与最佳实践

## 贡献

欢迎贡献。请先创建 issue 或 pull request 讨论变更。

## License

[MIT](LICENSE)
