# RAG 系统完整解析文档（TypeScript）

## 1. 背景与目标

RAG（Retrieval-Augmented Generation）用于把外部文档切分为可检索的语义片段，并通过向量检索与重排，将高相关内容喂给上层生成模型。该实现旨在：

- 在多格式文档输入下稳定产出可检索的 chunk
- 在向量检索基础上提供检索增强（MQE / HyDE / 图信号融合）
- 保持与存储适配层的解耦，支持多后端替换

范围：`src/memory/rag/pipeline.ts` 的核心流程，以及 `embedding/factory.ts` 的默认 embedder 工厂。

---

## 2. 核心组件与职责

### 2.1 文档加载与切分
- `loadDocuments`：负责“格式判断 → markdown 转换 → 语言检测 → heading 切段”
- `loadAndChunkTexts`：只做 chunk，基于 `loadDocuments` 的结果生成 `RagChunk`
- `splitParagraphsWithHeadings` / `chunkParagraphs`：按 heading 与 token 近似长度切分

```438:530:src/memory/rag/pipeline.ts
export function loadDocuments(
  options: LoadAndChunkTextsOptions,
): LoadedDocument[] {
  // ...
}

export function loadAndChunkTexts(
  options: LoadAndChunkTextsOptions,
): RagChunk[] {
  // ...
}
```

### 2.2 元数据标准化
- `buildRagMetadata`：集中拼装 `memory_type / rag_namespace / data_source / user_id` 等字段

```540:566:src/memory/rag/pipeline.ts
export function buildRagMetadata(
  chunk: RagChunk,
  ragNamespace = "default",
  userId = "rag_user",
): RagChunkMetadata {
  // ...
}
```

### 2.3 向量化与入库
- `indexChunks`：文本预处理 → embedding → 归一化 → upsert
- `preprocessMarkdownForEmbedding`：去 markdown 语法噪音

```572:662:src/memory/rag/pipeline.ts
export async function indexChunks(options: IndexChunksOptions): Promise<void> {
  // ...
}
```

### 2.4 检索与扩展
- `searchVectors`：单 query 向量检索
- `searchVectorsExpanded`：MQE / HyDE 扩展 + 合并去重

```676:742:src/memory/rag/pipeline.ts
export async function searchVectors(
  options: SearchVectorsOptions,
): Promise<VectorSearchHit[]> {
  // ...
}

``` 

```744:822:src/memory/rag/pipeline.ts
export async function searchVectorsExpanded(
  options: SearchVectorsExpandedOptions,
): Promise<VectorSearchHit[]> {
  // ...
}
```

### 2.5 排序与压缩
- `computeGraphSignalsFromPool`：同文档密度 + 近邻信号
- `rank`：向量分数 + 图信号融合
- `compressRankedItems`：同文档片段合并与限额

```860:1022:src/memory/rag/pipeline.ts
export function computeGraphSignalsFromPool(
  vectorHits: Array<Record<string, unknown>>,
  sameDocWeight = 1,
  proximityWeight = 1,
  proximityWindowChars = 1600,
): Record<string, number> {
  // ...
}
```

### 2.6 Pipeline 入口与依赖注入
- `createRagPipeline`：集中注入 store/embedder/namespace/userId

```1262:1352:src/memory/rag/pipeline.ts
export function createRagPipeline(
  options: CreateRagPipelineOptions = {},
): RagPipeline {
  // ...
}
```

---

## 3. 关键流程（结合代码）

### 3.1 写入流程（文档 → chunk → 向量入库）
1. `loadDocuments`：读取文件并转换为 markdown
2. `loadAndChunkTexts`：分段、分块、生成 `RagChunk`
3. `indexChunks`：预处理 → embedding → 存储

```438:662:src/memory/rag/pipeline.ts
export function loadDocuments(
  options: LoadAndChunkTextsOptions,
): LoadedDocument[] {
  // ...
}

export function loadAndChunkTexts(
  options: LoadAndChunkTextsOptions,
): RagChunk[] {
  // ...
}

export async function indexChunks(options: IndexChunksOptions): Promise<void> {
  // ...
}
```

### 3.2 检索流程（query → 向量检索 → 扩展 → 排序）
1. `searchVectors`：基础向量检索
2. `searchVectorsExpanded`：可选 MQE/HyDE 扩展，合并候选
3. `rank`：融合图信号，形成最终排序

```676:942:src/memory/rag/pipeline.ts
export async function searchVectors(
  options: SearchVectorsOptions,
): Promise<VectorSearchHit[]> {
  // ...
}

export async function searchVectorsExpanded(
  options: SearchVectorsExpandedOptions,
): Promise<VectorSearchHit[]> {
  // ...
}

export function rank(
  vectorHits: VectorSearchHit[],
  graphSignals: Record<string, number> = {},
  wVector = 0.7,
  wGraph = 0.3,
): Array<Record<string, unknown>> {
  // ...
}
```

---

## 4. 关键机制与实现细节

### 4.1 Chunk 去重
- 使用 `content_hash` 去重，避免重复片段进入索引
- `chunkId` 通过 `docId + start/end + content_hash` 计算

```474:528:src/memory/rag/pipeline.ts
const contentHash = md5(norm);
if (seenHashes.has(contentHash)) {
  continue;
}
seenHashes.add(contentHash);
```

### 4.2 Markdown 预处理
- 去标题/链接/强调/代码块，减少噪音

```536:558:src/memory/rag/pipeline.ts
export function preprocessMarkdownForEmbedding(text: string): string {
  // ...
}
```

### 4.3 查询扩展策略
- MQE：多查询改写
- HyDE：生成“答案段”作为检索查询

```720:816:src/memory/rag/pipeline.ts
async function promptMqe(
  query: string,
  n: number,
  llm?: LLMClient,
): Promise<string[]> {
  // ...
}

async function promptHyde(
  query: string,
  llm?: LLMClient,
): Promise<string | null> {
  // ...
}
```

---

## 5. 例子（从输入到输出）

**场景**：将 `docs/13-RAG-基础解析文档.md` 导入 RAG，并检索 “chunk overlap” 相关内容。

1. 写入：
- `loadDocuments` 读取文件并转 markdown
- `loadAndChunkTexts` 输出 `RagChunk[]`
- `indexChunks` 生成向量并写入存储

2. 检索：
- `searchVectorsExpanded` 通过 MQE 扩展查询
- `rank` 融合图信号
- `mergeSnippetsGrouped` 拼接输出摘要

关键入口：

```1262:1352:src/memory/rag/pipeline.ts
export function createRagPipeline(
  options: CreateRagPipelineOptions = {},
): RagPipeline {
  // ...
}
```

---

## 6. 可靠性与降级策略

- **读取失败**：`convertToMarkdown` 失败时回退到 `fallbackTextReader`
- **向量不可用**：若 embedder 异常，依赖 `HashTextEmbedder` 兜底
- **检索空查询**：`searchVectors/searchVectorsExpanded` 对空查询直接返回空数组

```256:330:src/memory/rag/pipeline.ts
export function convertToMarkdown(
  filePath: string,
  markitdownAdapter?: MarkitdownAdapter,
): string {
  // ...
}
```

---

## 7. 局限与演进建议

### 当前局限
- `RagChunk` 与 `MemoryItem` 结构不完全一致
- `CreateRagPipelineOptions` 选项仍是扁平结构

### 可落地演进
- 增加 `ragChunkToMemoryItem` 映射，减少调用层分支
- 将 `CreateRagPipelineOptions` 分层为 `storage/embedding/query`

---

## 8. 术语表
- **RagChunk**：RAG 切分后的最小检索单元
- **VectorStoreAdapter**：向量存储适配接口
- **MQE**：Multi-Query Expansion
- **HyDE**：Hypothetical Document Embeddings
- **Graph Signals**：文档密度与邻近信号
