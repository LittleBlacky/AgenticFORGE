# @agenticforge/memory

[![npm](https://img.shields.io/npm/v/@agenticforge/memory)](https://www.npmjs.com/package/@agenticforge/memory)
[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)


<p><strong>中文</strong> | <a href="./README.md">English</a></p>

AgenticFORGE 记忆系统包，提供四种记忆类型的统一管理器，以及可插拔存储适配层与 RAG 流水线。

## 安装

```bash
npm install @agenticforge/memory
```

### 子路径按需导入（v1.1.0+）

```ts
import {MemoryManager} from "@agenticforge/memory/manager";          // 7.6 KB
import {createRagPipeline} from "@agenticforge/memory/rag";           // 仅 RAG
import {QdrantVectorStore} from "@agenticforge/memory/storage";       // 仅存储
import {createDefaultTextEmbedder} from "@agenticforge/memory/embedding";
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

await memory.addMemory({
  content: "用户偏好深色主题",
  memoryType: "semantic",
  importance: 0.8,
});

const results = await memory.retrieveMemories({
  query: "用户界面偏好",
  limit: 3,
  memoryTypes: ["semantic"],
});
```

## 链接

- [GitHub](https://github.com/LittleBlacky/AgenticFORGE/tree/main/packages/memory)
- [npm](https://www.npmjs.com/package/@agenticforge/memory)
- [主项目 README](https://github.com/LittleBlacky/AgenticFORGE)
