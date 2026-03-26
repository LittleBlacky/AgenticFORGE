# 安装

## 一站式安装（推荐）

```bash
npm install @agenticforge/kit
# 或
pnpm add @agenticforge/kit
```

`@agenticforge/kit` 重新导出所有子包的内容，可直接导入任意符号：

```ts
import {
  LLMClient,
  FunctionCallAgent,
  Tool,
  toolAction,
  MemoryManager,
  ContextBuilder,
  SearchTool,
} from "@agenticforge/kit";
```

## 按需安装

```bash
npm install @agenticforge/core @agenticforge/tools @agenticforge/agents
```

## 子路径按需导入（Tree-shaking）

`@agenticforge/memory` 提供 6 个子路径导出，只下载实际需要的部分：

```ts
// 仅 7.6 KB — 不含 qdrant / neo4j / openai embedding
import {MemoryManager} from "@agenticforge/memory/manager";

// 仅 RAG 流水线（~30 KB）
import {createRagPipeline} from "@agenticforge/memory/rag";

// 仅存储适配器（~8 KB）
import {QdrantVectorStore} from "@agenticforge/memory/storage";

// 仅嵌入工厂（~0.6 KB）
import {createDefaultTextEmbedder} from "@agenticforge/memory/embedding";
```

## 环境变量

```bash
# LLM 调用必须
OPENAI_API_KEY=sk-...

# 可选：Qdrant 向量数据库
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=your-key

# 可选：网络搜索工具
TAVILY_API_KEY=tvly-...
SERPAPI_API_KEY=...
```
