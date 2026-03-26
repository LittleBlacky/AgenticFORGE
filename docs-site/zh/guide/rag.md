# RAG 流水线

内置 RAG（检索增强生成）流水线，让你基于自有内容索引文档并回答问题。

## 工作原理

```
文档 → 分块 → 嵌入向量 → 向量数据库
                                  ↓
用户问题 → 嵌入向量 → 相似度检索 → Top-K 块 → LLM → 答案
```

## 快速示例

```ts
import {createRagPipeline} from "@agenticforge/memory/rag";

const rag = createRagPipeline({ragNamespace: "my-docs"});

// 索引文档
const count = await rag.addDocuments(["./guide.md", "./api.md"]);
console.log(`已索引 ${count} 个分块`);

// 基础搜索
const hits = await rag.search("如何配置记忆系统", 5);
hits.forEach((h) => console.log(h.content));

// 高级搜索（多查询扩展 + HyDE）
const hits2 = await rag.searchAdvanced("记忆配置", 8, true, true);
```

## 接入 Qdrant

```ts
import {createRagPipeline} from "@agenticforge/memory/rag";
import {createDefaultVectorStore} from "@agenticforge/memory/storage";

const store = createDefaultVectorStore({
  backend: "qdrant",
  qdrantUrl: "http://localhost:6333",
  qdrantCollection: "docs",
  qdrantVectorSize: 384,
});

const rag = createRagPipeline({ragNamespace: "docs", store});
await rag.addDocuments(["./README.md"]);
```

## RagTool（供 Agent 使用）

```ts
import {RagTool} from "@agenticforge/tools-builtin";

const rag = new RagTool({knowledgeBasePath: "./kb"});

// 添加文档
await rag.run({action: "add_document", file_path: "./guide.md"});

// 提问
const answer = await rag.run({
  action: "ask",
  question: "如何使用记忆系统？",
});
console.log(answer);
```
