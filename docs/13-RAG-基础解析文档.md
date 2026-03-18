# RAG 模块分析设计文档（TypeScript 版）

## 1. 文档目标

本文档聚焦 `src/memory/rag` 章节，说明当前 TypeScript RAG 实现的：

- 架构分层与职责边界
- 核心数据流（加载 → 切块 → 向量化 → 入库 → 检索 → 排序/拼接）
- 关键配置项与运行方式
- 可扩展点与工程化建议
- 风险与优化路线

---

## 2. 模块范围与目录

RAG 相关代码位于：

- `src/memory/rag/document.ts`
- `src/memory/rag/pipeline.ts`
- `src/memory/rag/index.ts`

SDK 聚合导出：

- `src/index.ts`

其中：

- `document.ts`：文档与文档块模型、基础切分处理器
- `pipeline.ts`：完整 RAG 流程与检索增强能力
- `index.ts`：RAG 子模块导出入口

---

## 3. 设计目标

1. **完整链路可运行**：支持从文档到检索结果的全流程。
2. **适配多存储**：通过 `VectorStore` 抽象，支持内存存储与 Qdrant。
3. **适配多 Embedding 源**：通过 `TextEmbedder` 抽象，支持 Hash/OpenAI 及未来自定义模型。
4. **可演进检索质量**：内置查询扩展（MQE/HyDE）、图信号融合、重排接口。
5. **工程可测试**：支持 smoke test 与模块化替换。

---

## 4. 核心架构

### 4.1 分层视图

- **Data Model 层**（`document.ts`）
  - `Document`
  - `DocumentChunk`
  - `DocumentProcessor`

- **Pipeline 层**（`pipeline.ts`）
  - 文档加载与预处理
  - markdown-aware 切块
  - 向量化与索引
  - 检索与增强
  - 排序融合与上下文拼接

- **Infrastructure Adapter 层**（`pipeline.ts`）
  - `VectorStore` 接口
  - `InMemoryVectorStore`
  - `QdrantVectorStore`
  - `TextEmbedder` 接口
  - `HashTextEmbedder`
  - `OpenAITextEmbedder`

- **Facade 层**（`createRagPipeline`）
  - 提供高层 API：`addDocuments / search / searchAdvanced / getStats`

### 4.2 关键抽象接口

#### VectorStore

职责：屏蔽底层向量数据库差异。

- `addVectors(...)`
- `searchSimilar(...)`
- `getCollectionStats()`

#### TextEmbedder

职责：屏蔽 embedding 服务差异。

- `encode(text | text[])`

---

## 5. 数据模型设计

### 5.1 Document / DocumentChunk

- `Document`：文档实体（`content`, `metadata`, `docId`）
- `DocumentChunk`：分块实体（`content`, `metadata`, `chunkId`, `docId`, `chunkIndex`）

ID 设计：

- `docId` 默认由 `md5(content)` 生成
- `chunkId` 基于 `docId + chunkIndex + content片段` 生成

### 5.2 RagChunk / RagChunkMetadata

`RagChunk` 是 pipeline 的统一传输单元：

- `id`
- `content`
- `metadata`

`metadata` 包含文档来源、位置、命名空间、检索标签等，用于：

- 过滤（namespace/rag 标签）
- 引用（source/start/end/heading）
- 下游排序与合并

---

## 6. 核心流程设计

### 6.1 文档加载与文本标准化

入口函数：`loadAndChunkTexts(options)`

主要步骤：

1. 遍历输入 `paths`
2. `convertToMarkdown`（可注入 `markitdownAdapter`）
3. 语言识别 `detectLang`
4. 结构切分（标题 + 段落）
5. token 近似切块（含 overlap）
6. 去重（`content_hash`）
7. 输出 `RagChunk[]`

### 6.2 切块策略

函数链路：

- `splitParagraphsWithHeadings(text)`：保留标题路径与位置信息
- `chunkParagraphs(paragraphs, chunkTokens, overlapTokens)`：基于近似 token 长度分块

特点：

- 保留 `heading_path`
- 保留 `start/end` 便于引用定位
- overlap 保持上下文连续性

### 6.3 向量化与入库

入口函数：`indexChunks(options)`

步骤：

1. 预处理文本：`preprocessMarkdownForEmbedding`
2. 批量 embedding（默认 batch=64）
3. 向量归一化与维度对齐（`normalize2DVectors`）
4. 组装 metadata（增加 `memory_type/is_rag_data/rag_namespace`）
5. `store.addVectors(...)` 入库

### 6.4 检索

#### 基础检索：`searchVectors`

- query embedding
- 构造过滤条件：`memory_type=rag_chunk` +（可选）namespace/rag 标记
- `store.searchSimilar(...)`

#### 扩展检索：`searchVectorsExpanded`

- 支持 MQE（多查询扩展）
- 支持 HyDE（假设答案扩展）
- 多查询召回池合并，按最高分去重

### 6.5 重排与融合

- `rerankWithCrossEncoder`：以注入函数方式实现重排（避免硬绑定具体模型）
- `computeGraphSignalsFromPool`：同文档密度 + 距离邻近度信号
- `rank`：`final = wVector * vector + wGraph * graph`

### 6.6 上下文构建

- `mergeSnippets`：按分数拼接到字数上限
- `expandNeighborsFromPool`：补邻接 chunk
- `mergeSnippetsGrouped`：按文档分组拼接并输出引用
- `compressRankedItems`：文档内片段压缩合并

---

## 7. Qdrant 集成设计

### 7.1 连接与集合

`QdrantVectorStore` 支持：

- `url`
- `apiKey`
- `collectionName`
- `vectorSize`
- `distance`
- `timeoutMs`

集合行为：

- 首次写入/查询自动 `ensureCollection`
- 不存在则自动创建（按 `vectorSize + distance`）

### 7.2 过滤映射

`searchSimilar` 中将 `where` 转为 Qdrant filter，支持按 payload 字段过滤。

建议常用 payload 索引字段：

- `rag_namespace`（keyword）
- `memory_type`（keyword）
- `is_rag_data`（bool）
- `data_source`（keyword）
- `doc_id`（keyword）
- `lang`（keyword）
- `start/end`（integer）

---

## 8. 配置设计

建议 `.env` 关键项：

- `QDRANT_URL`
- `QDRANT_API_KEY`
- `QDRANT_COLLECTION_NAME`
- `QDRANT_VECTOR_SIZE`
- `QDRANT_DISTANCE`
- `QDRANT_TIMEOUT`
- `RAG_NAMESPACE`

Embedding 可选项：

- `EMBEDDING_MODEL_ID`
- `EMBEDDING_API_KEY`
- `EMBEDDING_BASE_URL`
- `EMBEDDING_TIMEOUT`

注意：

- `QDRANT_VECTOR_SIZE` 必须与 embedding 维度一致。
- `distance` 必须与检索评分预期一致（推荐 cosine）。

---

## 9. 高层 API 设计（Facade）

`createRagPipeline(...)` 对外暴露：

- `addDocuments(filePaths, chunkSize, chunkOverlap)`
- `search(query, topK, scoreThreshold)`
- `searchAdvanced(query, topK, enableMqe, enableHyde, scoreThreshold)`
- `getStats()`

优势：

- 隐藏底层复杂性
- 降低业务接入门槛
- 统一默认参数与行为

---

## 10. 质量与可观测性建议

1. **最小监控**
   - 入库条数、失败数、耗时
   - 查询耗时、命中率、topK 分布

2. **检索质量评估**
   - 准备固定评测问答集
   - 比较 baseline / mqe / hyde / rerank 的 Recall@K

3. **稳定性策略**
   - embedding 调用重试与退避
   - Qdrant 网络异常兜底
   - 空结果 fallback 文案

4. **数据治理**
   - 按 namespace/tenant 做隔离
   - 增加文档版本号与增量重建机制

---

## 11. 已知限制

1. `HashTextEmbedder` 仅用于本地联调，不适合生产语义检索。
2. `markitdownAdapter` 需外部注入，当前默认走文本 fallback。
3. Cross-Encoder 为接口注入模式，需业务侧提供具体 reranker。
4. 语言识别为轻量规则版（CJK 比例），可升级为专业检测器。

---

## 12. 演进路线（建议）

### Phase 1（当前）

- 完整流程可运行
- Qdrant + 基础检索 + 扩展检索

### Phase 2（短期）

- 增加 tenant 级隔离
- 引入可配置 reranker provider
- 增加 ingest/search 指标埋点

### Phase 3（中期）

- 支持混合检索（关键词 + 向量）
- 增加文档增量更新与删除索引
- 提供离线评测脚本与自动回归

---

## 13. 一句话总结

当前 `src/memory/rag` 已形成“**可运行、可替换、可演进**”的完整 TypeScript RAG 架构：
通过 `VectorStore/TextEmbedder` 抽象解耦基础设施，通过 `createRagPipeline` 统一业务入口，并在检索增强（MQE/HyDE/图信号/重排）上预留了生产级扩展空间。
