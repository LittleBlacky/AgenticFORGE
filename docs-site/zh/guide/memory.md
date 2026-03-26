# 记忆系统

AgenticFORGE 提供统一的 `MemoryManager`，管理四种不同类型的记忆，每种针对不同的时间和语义角色设计。

## 记忆类型

| 类型 | 作用域 | 适用场景 |
|------|--------|----------|
| `working` | 会话级 | 当前任务上下文、近期消息 |
| `episodic` | 长期、按时间索引 | 历史事件、对话记录 |
| `semantic` | 长期、按概念索引 | 事实、偏好、领域知识 |
| `perceptual` | 短期缓冲 | 原始输入（图片、音频、文件）|

## 基础用法

```ts
import {MemoryManager} from "@agenticforge/memory/manager";

const memory = new MemoryManager({
  userId: "user-123",
  enableWorking: true,
  enableEpisodic: true,
  enableSemantic: true,
});

// 存储记忆
await memory.addMemory({
  content: "用户正在构建 TypeScript Agent 框架",
  memoryType: "semantic",
  importance: 0.9,
  metadata: {source: "对话", timestamp: new Date().toISOString()},
});

// 检索记忆
const results = await memory.retrieveMemories({
  query: "用户在做什么项目？",
  limit: 5,
  memoryTypes: ["semantic", "episodic"],
  minImportance: 0.5,
});

console.log(results.map((r) => r.content));
```

## 记忆操作

```ts
// 更新
await memory.updateMemory({memoryId: "mem-abc", content: "新内容", importance: 0.95});

// 删除
await memory.removeMemory("mem-abc");

// 遗忘低重要性记忆
await memory.forgetMemories({strategy: "importance_based", threshold: 0.2});

// 将工作记忆归档为情节记忆
await memory.consolidateMemories({
  fromType: "working",
  toType: "episodic",
  importanceThreshold: 0.7,
});
```

## 接入 Qdrant 向量数据库

```ts
const memory = new MemoryManager({
  enableSemantic: true,
  adapterConfigs: [
    {
      type: "vectorStore",
      backend: "qdrant",
      options: {
        url: process.env.QDRANT_URL ?? "http://localhost:6333",
        apiKey: process.env.QDRANT_API_KEY,
        collection: "agent-memory",
      },
    },
  ],
});

await memory.initialize();
```

## 用 Docker 启动 Qdrant + Neo4j

```bash
# Qdrant
docker run -p 6333:6333 qdrant/qdrant

# Neo4j
docker run -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/password \
  neo4j:latest
```
