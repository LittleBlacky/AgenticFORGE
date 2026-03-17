# @agenticforge/memory

[![npm](https://img.shields.io/npm/v/@agenticforge/memory)](https://www.npmjs.com/package/@agenticforge/memory)
[![license](https://img.shields.io/github/license/LittleBlacky/AgenticFORGE)](https://github.com/LittleBlacky/AgenticFORGE/blob/main/LICENSE)

AgenticFORGE 记忆系统包，提供四种记忆类型（工作、情节、语义、感知）的统一管理器，以及可插拔存储适配层与 RAG 流水线。

> Multi-type memory manager, pluggable storage adapters, and RAG pipeline for AgenticFORGE.

## 安装

```bash
npm install @agenticforge/memory
```

## 记忆类型

| 类型 | 说明 |
|------|------|
| `working` | 工作记忆：短期上下文，会话级别 |
| `episodic` | 情节记忆：历史事件，带时间戳与重要性 |
| `semantic` | 语义记忆：知识与概念，支持向量检索 |
| `perceptual` | 感知记忆：原始输入/输出的临时缓冲 |

## 使用示例

```ts
import {MemoryManager} from "@agenticforge/memory";

const memory = new MemoryManager({
  enableWorking: true,
  enableEpisodic: true,
  enableSemantic: true,
});

// 存储
await memory.addMemory({
  content: "用户偏好深色主题",
  memoryType: "semantic",
  importance: 0.8,
});

// 检索
const results = await memory.retrieveMemories({
  query: "用户界面偏好",
  limit: 3,
  memoryTypes: ["semantic"],
});
```

## 接入向量数据库

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

## 链接

- [GitHub](https://github.com/LittleBlacky/AgenticFORGE/tree/main/packages/memory)
- [npm](https://www.npmjs.com/package/@agenticforge/memory)
- [主项目 README](https://github.com/LittleBlacky/AgenticFORGE)
