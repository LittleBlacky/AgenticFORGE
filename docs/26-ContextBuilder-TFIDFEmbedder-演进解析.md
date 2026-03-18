# ContextBuilder 演进实现解析文档（TF-IDF 向量 / 可插拔 Embedder / 新近性衰减）

## 1. 背景与目标

- **背景**：上一版 ContextBuilder 的 MMR 相似度基于简单词频统计（`simpleVec`），仅做词袋频率计数，未区分高频无意义词（如 "the"、"是"）与低频关键词的权重差异，导致检索质量较低。同时缺少新近性时间衰减，无法区分新旧信息的优先级。
- **目标**：
  1. 将 MMR 向量表示从词频袋升级为 **TF-IDF 加权向量**，显著提升词义区分度。
  2. 引入 **可插拔 `TextEmbedder`**，允许外接 OpenAI / BGE 等稠密向量模型，获得真正的语义相似度。
  3. 引入 **新近性时间衰减评分**，将时间因素纳入复合评分。
  4. 两条路径统一收敛到 **`denseCosine`**，简化计算路径。

---

## 2. 核心组件与职责

### 2.1 TextEmbedder（新增）

```ts
export type TextEmbedder = (texts: string[]) => Promise<number[][]>;
```

- 接受文本数组，返回等长的稠密向量数组。
- 完全可插拔：接 OpenAI、BGE、Ollama 等任意 embedding 服务。
- 通过 `ContextBuilderConfig.embedder` 注入。

### 2.2 TF-IDF 向量（本地，零 API 调用）

当 `embedder` 未配置或调用失败时，自动使用 TF-IDF 作为降级方案。

关键函数：

| 函数 | 职责 |
|------|------|
| `tokenize(text)` | 小写化 + 按非字母数字分割 |
| `buildIdf(docs)` | 计算平滑 IDF：`log((N+1)/(df+1)) + 1` |
| `tfidfArray(text, idf, termIndex)` | 计算单文档 TF-IDF 稠密数组 |
| `buildTfIdfVecs(query, packets)` | 以 query+packets 为语料库，返回 query 和每个 packet 的向量 |

### 2.3 compositeScore（新近性 + 相关性）

```
composite = (1 - rw) × relevance + rw × exp(-Δt / τ)
```

- `rw = recencyWeight`（默认 0.3）
- `τ = recencyTau`（默认 3,600,000 ms = 1 小时）
- `Δt = now - packet.timestamp`（毫秒）
- 当 `timestamp` 未设置时，视为当前时间（新近性 = 1.0）

### 2.4 MMR 选择（selectMmr，现为 async）

```
mmrScore = λ × composite(p, cosine(query, p)) - (1-λ) × max_sim(p, selected)
```

向量路径优先级：
1. **外部 embedder**（语义稠密向量）→ `denseCosine`
2. **TF-IDF**（本地 IDF 加权词袋向量）→ `denseCosine`（同一套余弦函数）
3. embedder 调用失败时自动降级到 TF-IDF

---

## 3. 关键流程（结合代码）

### 3.1 向量构建流程

```
build()
  └─ selectMmr(packets, query, budget)
        ├─ [有 embedder]
        │     embedder([query, ...contents]) → number[][]
        │     失败 → buildTfIdfVecs(query, packets)
        └─ [无 embedder]
              buildTfIdfVecs(query, packets)
                └─ buildIdf(corpus)        # 平滑 IDF
                   tfidfArray(text, ...)   # TF × IDF → 稠密数组
```

### 3.2 MMR 迭代

```
while remaining.length > 0 && used < budget:
  for each candidate p:
    relCos   = denseCosine(queryVec, pVec)          # 语义相关性
    composite = (1-rw)*relCos + rw*exp(-Δt/τ)       # 含新近性
    maxSim   = max(denseCosine(pVec, sVec) for s in selected)  # 冗余惩罚
    score    = λ*composite - (1-λ)*maxSim
  选 score 最高者加入 selected
```

---

## 4. 关键机制与实现细节

### TF-IDF vs 词频袋对比

| 维度 | 旧版 simpleVec | 新版 TF-IDF |
|------|----------------|-------------|
| 向量类型 | 稀疏 Map（词频） | 稠密数组（TF×IDF 权重） |
| 高频词处理 | 权重等同低频词 | IDF 压低高频词权重 |
| 语料感知 | 无 | 以 query+packets 为语料库动态计算 IDF |
| 余弦路径 | 稀疏 Map 余弦 | 统一 `denseCosine`（更快） |

### 平滑 IDF 公式

\[
\text{IDF}(t) = \log\frac{N+1}{df(t)+1} + 1
\]

- 避免 IDF 为 0 或负值
- 未见词使用 `log(2)` 作为默认 IDF

### embedder 降级策略

```ts
try {
  const vecs = await this.config.embedder(texts);
  // 使用稠密向量
} catch {
  // 自动降级到 TF-IDF
  const {qv, pm} = buildTfIdfVecs(query, packets);
}
```

---

## 5. 例子（从输入到输出）

### 场景：三条候选 packet，两条语义相近

```ts
const builder = new ContextBuilder({
  config: {
    enableMmr: true,
    mmrLambda: 0.6,
    recencyWeight: 0.3,
    recencyTau: 1_800_000, // 30 分钟
    // 可选：接入 OpenAI embedding
    embedder: async (texts) => {
      const res = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: texts,
      });
      return res.data.map(d => d.embedding);
    },
  },
});

const result = await builder.build({
  userQuery: 'RAG 检索增强生成如何工作',
  additionalPackets: [
    {
      content: 'RAG 将检索结果拼入 prompt，提升 LLM 回答准确性',
      metadata: {type: 'knowledge'},
      relevanceScore: 0.9,
      timestamp: Date.now() - 60_000,      // 1 分钟前
    },
    {
      content: '检索增强生成通过向量搜索找到相关文档',
      metadata: {type: 'knowledge'},
      relevanceScore: 0.85,
      timestamp: Date.now() - 600_000,     // 10 分钟前
    },
    {
      content: 'Python 异步编程使用 asyncio 事件循环',
      metadata: {type: 'knowledge'},
      relevanceScore: 0.4,
      timestamp: Date.now() - 30_000,      // 30 秒前
    },
  ],
});
```

**预期结果**：
- packet 1（新近 + 高相关）：composite 最高，优先选入
- packet 2（与 packet 1 语义高度重叠）：MMR 多样性惩罚降低其分数
- packet 3（Python 话题）：相关性低，即使新近也被过滤

---

## 6. 可靠性与降级策略

| 失败点 | 降级路径 |
|--------|----------|
| `embedder` 抛出异常 | 自动切换为 TF-IDF 向量 |
| `embedder` 未配置 | 直接使用 TF-IDF，无需感知 |
| `timestamp` 缺失 | 视为当前时间，新近性 = 1.0 |
| MMR 关闭 | 退回 Greedy（按 compositeScore 排序） |
| token 预算不足 | 跳过超预算的 packet，继续迭代 |

---

## 7. 配置参数速查

```ts
const builder = new ContextBuilder({
  config: {
    maxTokens: 4096,           // 总 token 预算
    enableMmr: true,           // 启用 MMR 多样性
    mmrLambda: 0.5,            // λ: 0=纯多样性, 1=纯相关性
    minRelevance: 0.3,         // 最低相关性阈值（过滤用）
    recencyWeight: 0.3,        // 新近性权重
    recencyTau: 3_600_000,     // 衰减时间尺度（ms）
    embedder: myEmbedFn,       // 可选外部 embedding 函数
    systemTokenBudget: 512,    // 系统提示 token 预算
    historyTokenBudget: 1024,  // 对话历史 token 预算
  },
});
```

---

## 8. 局限与演进建议

- **TF-IDF 仍是词袋模型**：无法处理同义词（"检索" vs "搜索"），语义 gap 仍存在；接入外部 embedder 可彻底解决。
- **IDF 语料库范围小**：仅基于当前 query+packets 构建，IDF 估计精度有限；可引入预建语料库 IDF。
- **MMR 时间复杂度**：O(n²)，n 为候选 packet 数；大规模场景可引入 ANN（近似最近邻）加速。
- **向量未缓存**：多次 `build` 调用会重复计算 TF-IDF；可引入 LRU 缓存（参考 