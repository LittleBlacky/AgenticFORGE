# 上下文构建器

`ContextBuilder` 在 Token 预算内组装 LLM 消息，支持 MMR 多样性选择、TF-IDF 或稠密向量相似度，以及新近性时间衰减评分。

## 基础用法

```ts
import {ContextBuilder} from "@agenticforge/context";

const builder = new ContextBuilder();

const result = await builder.build({
  systemInstructions: "你是一个专业的代码助手。",
  userQuery: "帮我重构这个函数以提高可读性。",
  conversationHistory: history,
});

// result.system        → 系统提示词字符串
// result.messages      → Message[]（对话历史 + 用户问题）
// result.totalTokens   → 估算的 token 总数
// result.includedPackets → 已选入的 ContextPacket 列表
```

## 添加上下文 Packet

`additionalPackets` 是额外的知识片段（RAG 结果、记忆片段、工具输出），在 token 预算内按分数排序后选入。

```ts
import {ContextPacketBuilder} from "@agenticforge/context";

const result = await builder.build({
  userQuery: "向量搜索是怎么工作的？",
  additionalPackets: [
    ContextPacketBuilder.withRelevance(
      ContextPacketBuilder.create(
        "向量搜索通过 embedding 找到语义相似的文档。",
        {source: "docs"},
      ),
      0.92,
    ),
    ContextPacketBuilder.withRelevance(
      ContextPacketBuilder.create(
        "HNSW 是一种基于图的近似最近邻算法。",
        {source: "docs"},
      ),
      0.78,
    ),
  ],
});
```

## MMR 多样性选择

开启 MMR 可减少选入内容的冗余度：

```ts
const builder = new ContextBuilder({
  config: {
    enableMmr: true,
    mmrLambda: 0.6,   // 0=纯多样性，1=纯相关性
    maxTokens: 4096,
  },
});
```

MMR 评分公式：
```
mmrScore = λ × composite(p) - (1-λ) × max_sim(p, selected)
```

## 新近性时间衰减评分

带有 `timestamp` 字段的 packet 会按时间新近程度加权：

```ts
const builder = new ContextBuilder({
  config: {
    enableMmr: true,
    recencyWeight: 0.3,       // 30% 新近性，70% 相关性
    recencyTau: 1_800_000,    // 衰减时间尺度：30 分钟（ms）
  },
});

const result = await builder.build({
  userQuery: "最新状态是什么？",
  additionalPackets: [
    {
      content: "任务已成功完成。",
      metadata: {},
      relevanceScore: 0.85,
      timestamp: Date.now() - 30_000,    // 30 秒前 → 新近性高
    },
    {
      content: "任务今早已启动。",
      metadata: {},
      relevanceScore: 0.80,
      timestamp: Date.now() - 7_200_000, // 2 小时前 → 新近性低
    },
  ],
});
```

复合评分公式：
```
composite = (1 - recencyWeight) × relevance + recencyWeight × exp(-Δt / recencyTau)
```

## 语义相似度：接入 Embedder

### 使用 `@agenticforge/memory` embedder（推荐）

```ts
import {createDefaultTextEmbedder} from "@agenticforge/memory";
import {ContextBuilder} from "@agenticforge/context";

// 自动读取 EMBEDDING_* 环境变量；未配置时降级到哈希向量
const builder = new ContextBuilder({
  config: {
    enableMmr: true,
    memoryEmbedder: createDefaultTextEmbedder(),
  },
});
```

### 使用自定义 OpenAI Embedder

```ts
const builder = new ContextBuilder({
  config: {
    enableMmr: true,
    embedder: async (texts) => {
      const res = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: texts,
      });
      return res.data.map(d => d.embedding);
    },
  },
});
```

### 相似度优先级链

```
explicit embedder（显式传入）
  → memoryEmbedder（自动适配）
    → TF-IDF 加权词袋向量（本地，零延迟）
      → embedder 出错时自动降级
```

## Token 预算控制

```ts
const builder = new ContextBuilder({
  config: {
    maxTokens: 8192,
    systemTokenBudget: 512,   // 系统提示词预留 token
    historyTokenBudget: 2048, // 对话历史最大 token
    minRelevance: 0.3,        // 过滤低于此分数的 packet
  },
});
```

历史记录从最新到最旧填充；packet 按复合分排序后贪心填充（或 MMR），直到预算耗尽。

## 配置项速查

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `maxTokens` | `number` | `4096` | 总 token 预算 |
| `enableMmr` | `boolean` | `false` | 启用 MMR 多样性选择 |
| `mmrLambda` | `number` | `0.5` | MMR λ（0=多样性，1=相关性） |
| `minRelevance` | `number` | `0` | 最低相关性阈值 |
| `recencyWeight` | `number` | `0.3` | 新近性权重 |
| `recencyTau` | `number` | `3600000` | 新近性衰减时间尺度（ms） |
| `embedder` | `TextEmbedder` | — | 自定义稠密向量 embedder |
| `memoryEmbedder` | `MemoryEmbedderLike` | — | `@agenticforge/memory` embedder |
| `systemTokenBudget` | `number` | `512` | 系统提示词 token 上限 |
| `historyTokenBudget` | `number` | `1024` | 对话历史 token 上限 |
| `tokenCounter` | `TokenCounter` | — | 自定义 token 计数函数 |
