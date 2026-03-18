# RAG 存储适配层改进解析（TypeScript）

## 1. 背景与目标
当前 RAG 实现已经引入 `VectorStoreAdapter` 抽象，但在调用层仍然存在“多点默认注入”的问题：`indexChunks`、`searchVectors`、`searchVectorsExpanded` 这些核心流程在内部自行创建默认 store，导致默认策略分散、替换成本上升。  
本次改进的目标是：**把默认 store 的注入集中到 `createRagPipeline` 这一处**，其余流程必须显式传入 store，从而让存储策略更加集中、可控、可替换。

---

## 2. 改造原则
- **单一入口**：默认 store 只在 pipeline 构造时决定
- **显式依赖**：所有核心函数依赖 `store` 参数，不再暗自创建
- **可替换性**：便于替换为 Qdrant、Pinecone、Weaviate 等实现

---

## 3. 核心改动点

### 3.1 改造前后对比代码片段（关键差异）

#### 3.1.1 `indexChunks` 默认 store 处理

改造前（函数内部兜底创建）：

```ts
export async function indexChunks(options: IndexChunksOptions): Promise<void> {
  // ...
  const store = options.store ?? createDefaultVectorStore();
  // ...
}
```

改造后（必须显式传入）：

```ts
export async function indexChunks(options: IndexChunksOptions): Promise<void> {
  // ...
  const store = options.store;
  // ...
}
```

#### 3.1.2 `searchVectors` 默认 store 处理

改造前（函数内部兜底创建）：

```ts
export async function searchVectors(
  options: SearchVectorsOptions,
): Promise<VectorSearchHit[]> {
  // ...
  const store = options.store ?? createDefaultVectorStore();
  // ...
}
```

改造后（必须显式传入）：

```ts
export async function searchVectors(
  options: SearchVectorsOptions,
): Promise<VectorSearchHit[]> {
  // ...
  const store = options.store;
  // ...
}
```

#### 3.1.3 `searchVectorsExpanded` 默认 store 处理

改造前（函数内部兜底创建）：

```ts
export async function searchVectorsExpanded(
  options: SearchVectorsExpandedOptions,
): Promise<VectorSearchHit[]> {
  // ...
  const store = options.store ?? createDefaultVectorStore();
  // ...
}
```

改造后（必须显式传入）：

```ts
export async function searchVectorsExpanded(
  options: SearchVectorsExpandedOptions,
): Promise<VectorSearchHit[]> {
  // ...
  const store = options.store;
  // ...
}
```

#### 3.1.4 默认注入入口集中到 `createRagPipeline`

改造前（调用层 + 函数内部均可默认创建）：

```ts
export function createRagPipeline(
  options: CreateRagPipelineOptions = {},
): RagPipeline {
  const ragNamespace = options.ragNamespace ?? "default";
  const dimension = options.dimension ?? 384;
  const store = options.store ?? createDefaultVectorStore();
  const embedder = options.embedder ?? createDefaultTextEmbedder(dimension);
  // ...
}
```

改造后（唯一默认入口仍是 `createRagPipeline`，其余流程必须显式传入）：

```ts
export function createRagPipeline(
  options: CreateRagPipelineOptions = {},
): RagPipeline {
  const ragNamespace = options.ragNamespace ?? "default";
  const dimension = options.dimension ?? 384;
  const store = options.store ?? createDefaultVectorStore();
  const embedder = options.embedder ?? createDefaultTextEmbedder(dimension);
  // ...
}
```

---

### 3.2 `IndexChunksOptions.store` 改为必填
以前 `indexChunks` 内部会使用 `createDefaultVectorStore()`。现在改为强制传入。

```546:613:src/memory/rag/pipeline.ts
export interface IndexChunksOptions {
  store: VectorStoreAdapter;
  chunks?: RagChunk[];
  batchSize?: number;
  ragNamespace?: string;
  embedder?: TextEmbedder;
  dimension?: number;
}
```

```565:613:src/memory/rag/pipeline.ts
export async function indexChunks(options: IndexChunksOptions): Promise<void> {
  // ...
  const store = options.store;
  // ...
}
```

---

### 3.2 `SearchVectorsOptions.store` 改为必填
同样移除默认 store 注入，只保留显式传入。

```656:724:src/memory/rag/pipeline.ts
export interface SearchVectorsOptions {
  store: VectorStoreAdapter;
  query: string;
  topK?: number;
  ragNamespace?: string;
  onlyRagData?: boolean;
  scoreThreshold?: number;
  embedder?: TextEmbedder;
  dimension?: number;
}
```

```668:724:src/memory/rag/pipeline.ts
export async function searchVectors(
  options: SearchVectorsOptions,
): Promise<VectorSearchHit[]> {
  // ...
  const store = options.store;
  // ...
}
```

---

### 3.3 `searchVectorsExpanded` 同样移除默认 store
多查询扩展检索改为完全依赖传入 store。

```754:818:src/memory/rag/pipeline.ts
export async function searchVectorsExpanded(
  options: SearchVectorsExpandedOptions,
): Promise<VectorSearchHit[]> {
  // ...
  const store = options.store;
  // ...
}
```

---

### 3.4 `createRagPipeline` 成为唯一默认注入入口
默认 store 和 embedder 只在 pipeline 构造时决定，集中管理。

```1278:1352:src/memory/rag/pipeline.ts
export function createRagPipeline(
  options: CreateRagPipelineOptions = {},
): RagPipeline {
  const ragNamespace = options.ragNamespace ?? "default";
  const dimension = options.dimension ?? 384;
  const store = options.store ?? createDefaultVectorStore();
  const embedder = options.embedder ?? createDefaultTextEmbedder(dimension);
  // ...
}
```

---

## 4. 结果与收益

### ✅ 更集中
默认 store 只在 `createRagPipeline` 里出现，调用层不再隐式回退。

### ✅ 更清晰
函数签名直接表达依赖，避免“参数可选但实际需要”的歧义。

### ✅ 更可替换
更适合在多环境使用不同存储实现：本地内存、Qdrant、云向量库等。

---

## 5. 调用链对比（改造后）

1. **Pipeline 构建阶段**：决定默认 store
2. **写入 / 检索阶段**：全部透传 store

```ts
const addDocuments = async (...) => {
  // ...
  await indexChunks({ store, ... });
};

const search = async (...) => {
  return searchVectors({ store, ... });
};

const searchAdvanced = async (...) => {
  return searchVectorsExpanded({ store, ... });
};
```

### 5.1 调用层改造示例（Before / After）

#### 5.1.1 直接调用 `indexChunks`

改造前（可省略 store，隐式走默认）：

```ts
await indexChunks({
  chunks,
  ragNamespace: "default",
});
```

改造后（必须显式传入 store）：

```ts
const store = createDefaultVectorStore();
await indexChunks({
  store,
  chunks,
  ragNamespace: "default",
});
```

#### 5.1.2 直接调用 `searchVectors`

改造前（未传 store 也能运行，但默认策略分散）：

```ts
const hits = await searchVectors({
  query: "xxx",
  topK: 8,
});
```

改造后（调用层统一注入 store）：

```ts
const store = createDefaultVectorStore();
const hits = await searchVectors({
  store,
  query: "xxx",
  topK: 8,
});
```

#### 5.1.3 推荐：通过 `createRagPipeline` 统一注入

改造前（调用层与函数内部都可能兜底）：

```ts
const pipeline = createRagPipeline();
const hits = await pipeline.search("xxx");
```

改造后（仍保持相同调用方式，但默认策略集中在 pipeline）：

```ts
const pipeline = createRagPipeline();
const hits = await pipeline.search("xxx");
```

---

## 6. P0 改造补充解析（查询参数收口 + Embedding 工厂下沉）

### 6.1 查询参数收口：引入 `RagQueryOptions`

目标：把散落在多个函数签名中的查询参数统一收口，降低调用层复杂度。

新增结构：

```ts
export interface RagQueryOptions {
  topK?: number;
  ragNamespace?: string;
  onlyRagData?: boolean;
  scoreThreshold?: number;
  enableMqe?: boolean;
  mqeExpansions?: number;
  enableHyde?: boolean;
  candidatePoolMultiplier?: number;
}
```

调用层变化（示意）：

```ts
return searchVectors({
  store,
  query,
  options: {
    topK,
    ragNamespace,
    scoreThreshold,
  },
  embedder,
  dimension,
});
```

效果：
- 统一查询配置入口，减少“参数散落 + 传递链噪音”
- 便于后续新增查询特性（只扩展 `RagQueryOptions`）

---

### 6.2 Embedding 工厂下沉：`createDefaultTextEmbedder`

目标：让 RAG pipeline 不直接承担 embedder 的创建逻辑，降低耦合。

---

### 6.3 RAG 用户标识参数化（移除硬编码 `user_id`）

问题：
- 早期实现中 `user_id` 固定为 `"rag_user"`，导致多租户或多用户场景不可控。

改造：
- 新增 `ragUserId`，在 `CreateRagPipelineOptions` 与 `IndexChunksOptions` 里透传
- `buildRagMetadata` 统一接收 `userId` 并写入元数据

示意代码：

```ts
export function buildRagMetadata(
  chunk: RagChunk,
  ragNamespace = "default",
  userId = "rag_user",
): RagChunkMetadata {
  return {
    memory_id: chunk.id,
    user_id: userId,
    // ...
  };
}
```

调用层透传：

```ts
const pipeline = createRagPipeline({
  ragNamespace: "default",
  ragUserId: "user-123",
});
```

收益：
- 元数据更具可控性
- 支持多用户/多租户隔离场景

---

### 6.4 Embedding 工厂下沉变更点（补充）

变更：
- 新增 `src/memory/embedding/factory.ts`
- `createDefaultTextEmbedder` 下沉至工厂层
- `pipeline.ts` 改为从工厂导入

调用示意：

```ts
import {createDefaultTextEmbedder} from "../embedding/factory";

const embedder = options.embedder ?? createDefaultTextEmbedder(dimension);
```

效果：
- embedder 创建逻辑集中，便于后续扩展不同模型/供应商
- RAG pipeline 只依赖抽象，不关心具体创建细节

---

## 7. P1 改造补充解析（元数据标准化 + 文档加载接口统一）

### 7.1 RAG 元数据标准化：`buildRagMetadata`

目标：把 `memory_type / rag_namespace / data_source / user_id` 等字段的拼装集中管理，避免散落与重复。

新增函数：

```ts
export function buildRagMetadata(
  chunk: RagChunk,
  ragNamespace = "default",
  userId = "rag_user",
): RagChunkMetadata {
  return {
    memory_id: chunk.id,
    user_id: userId,
    memory_type: "rag_chunk",
    content: chunk.content,
    data_source: "rag_pipeline",
    rag_namespace: ragNamespace,
    is_rag_data: true,
    ...chunk.metadata,
  };
}
```

调用替换：

```ts
metadata.push(buildRagMetadata(ch, ragNamespace, ragUserId));
```

效果：
- 元数据结构统一、可复用
- 未来若字段调整只需改一处

---

### 7.2 统一文档加载接口：`loadDocuments`

目标：将“格式判断 → markdown 转换 → 语言检测 → heading 切段”的流程独立出来，使 `loadAndChunkTexts` 只承担 chunk 逻辑。

新增结构：

```ts
export interface LoadedDocument {
  filePath: string;
  ext: string;
  markdownText: string;
  lang: string;
  docId: string;
  paragraphs: Paragraph[];
}
```

新增入口：

```ts
export function loadDocuments(
  options: LoadAndChunkTextsOptions,
): LoadedDocument[] {
  // 格式判断、转换、切段在这里完成
}
```

`loadAndChunkTexts` 只做 chunk：

```ts
const loadedDocs = loadDocuments(options);
for (const doc of loadedDocs) {
  const tokenChunks = chunkParagraphs(doc.paragraphs, ...);
  // ... 生成 RagChunk
}
```

效果：
- 文档处理与分块职责解耦
- 更方便复用 `loadDocuments`（比如仅做扫描/统计）

---

## 8. P2 后续演进方向（模型对齐 + 选项分层）

### 8.1 RAG 与 MemoryItem 模型对齐

目标：让 `RagChunk.metadata` 更贴近 `MemoryItem` 的字段结构，减少“RAG 与 Memory 两套体系并存”的割裂感。

建议方向：
- 将 `rag_namespace / data_source / memory_type / user_id` 结构与 `MemoryItem` 统一命名规则
- 引入 `RagChunkAsMemoryItem`（或映射函数）用于对齐字段
- 在检索结果返回时尽可能输出 `MemoryItem` 结构，减少调用层分支处理

示意：

```ts
export interface RagChunkAsMemoryItem {
  id: string;
  content: string;
  memoryType: "rag_chunk";
  userId: string;
  timestamp?: Date;
  metadata: RagChunkMetadata;
}
```

收益：
- 统一 Memory 体系的数据模型
- 下游调用更一致（减少 RAG 专用逻辑）

---

### 8.2 RAG Pipeline 选项分层

目标：将 `CreateRagPipelineOptions` 拆成更清晰的分层结构，提升可维护性与可读性。

建议结构：

```ts
export interface RagStorageOptions {
  store?: VectorStoreAdapter;
  ragNamespace?: string;
  ragUserId?: string;
}

export interface RagEmbeddingOptions {
  embedder?: TextEmbedder;
  dimension?: number;
}

export interface RagQueryOptions {
  topK?: number;
  scoreThreshold?: number;
  enableMqe?: boolean;
  enableHyde?: boolean;
}

export interface CreateRagPipelineOptions {
  storage?: RagStorageOptions;
  embedding?: RagEmbeddingOptions;
  query?: RagQueryOptions;
  markitdownAdapter?: MarkitdownAdapter;
}
```

收益：
- 选项语义分层清晰
- 避免参数增长导致结构臃肿
- 更易扩展（新增选项不影响已有层级）

---

### 8.3 P2 落地改造草案（接口变更清单）

#### 8.3.1 `RagChunk` → `MemoryItem` 映射

新增映射函数（示意）：

```ts
export function ragChunkToMemoryItem(
  chunk: RagChunk,
  ragUserId = "rag_user",
): MemoryItem {
  return {
    id: chunk.id,
    content: chunk.content,
    memoryType: "rag_chunk",
    userId: ragUserId,
    timestamp: new Date(),
    metadata: chunk.metadata,
  };
}
```

调用层变更（建议）：
- `searchVectors/searchVectorsExpanded` 可提供 `asMemoryItem` 选项
- 对外统一返回 `MemoryItem` 结构，减少特殊分支

---

#### 8.3.2 `CreateRagPipelineOptions` 分层化

变更方向：

```ts
// before
createRagPipeline({
  ragNamespace,
  ragUserId,
  store,
  embedder,
  dimension,
  markitdownAdapter,
});

// after
createRagPipeline({
  storage: {ragNamespace, ragUserId, store},
  embedding: {embedder, dimension},
  query: {topK, enableMqe, enableHyde},
  markitdownAdapter,
});
```

迁移策略建议：
- 先保留旧字段一段时间（兼容层）
- 内部归一化到新结构
- 下一大版本移除旧字段

---

## 9. 可选的下一步优化
- 在 `indexChunks/searchVectors` 内部加运行时断言（`if (!store) throw`）
- 将 `createDefaultVectorStore` 抽到独立工厂层，便于环境配置
- 加入显式 DI 容器或配置中心，让存储策略统一管理

---

## 10. 小结
这次改动的核心价值是**让存储适配层的介入更集中、更可控、更易替换**。在此基础上，P0 的查询参数收口与 embedding 工厂下沉、P1 的元数据标准化与文档加载接口统一进一步降低了调用层复杂度、提升了扩展性；P2 则为模型对齐与配置分层提供了可演进路径。
