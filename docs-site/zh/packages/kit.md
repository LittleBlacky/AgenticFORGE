# @agenticforge/kit

[![npm](https://img.shields.io/npm/v/@agenticforge/kit)](https://www.npmjs.com/package/@agenticforge/kit)

一站式入口包 — 一次安装，使用全部能力。

## 安装

```bash
npm install @agenticforge/kit
```

## 包含内容

| 包 | 内容 |
|----|------|
| `@agenticforge/core` | 核心类型、LLM 客户端 |
| `@agenticforge/tools` | Tool 抽象、Registry、Chain |
| `@agenticforge/agents` | 5 种 Agent 实现 |
| `@agenticforge/memory` | 多类型记忆管理器、RAG、存储适配层 |
| `@agenticforge/tools-builtin` | 搜索、记忆、笔记、RAG、终端工具 |
| `@agenticforge/context` | Token 感知上下文构建器 |
| `@agenticforge/utils` | LRU 缓存、Prompt 工具 |

## 使用示例

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

const result = await agent.run("搜索 AgenticFORGE 最新动态。");
console.log(result);
```
