# @agenticforge/memory

[![npm](https://img.shields.io/npm/v/@agenticforge/memory)](https://www.npmjs.com/package/@agenticforge/memory)

多类型记忆管理器、可插拔存储适配层与 RAG 流水线。

## 安装

```bash
npm install @agenticforge/memory
```

## 子路径导入（v1.1.0+）

```ts
import {MemoryManager} from "@agenticforge/memory/manager";          // 7.6 KB
import {createRagPipeline} from "@agenticforge/memory/rag";           // 30 KB
import {QdrantVectorStore} from "@agenticforge/memory/storage";       // 8 KB
import {createDefaultTextEmbedder} from "@agenticforge/memory/embedding"; // 0.6 KB
```

## 记忆类型

| 类型 | 作用域 | 适用场景 |
|------|--------|----------|
| `working` | 会话级 | 当前任务上下文 |
| `episodic` | 长期 | 历史事件、对话记录 |
| `semantic` | 长期 | 事实、知识、偏好 |
| `perceptual` | 短期缓冲 | 原始输入 |

详见 [记忆系统指南](/zh/guide/memory)。
