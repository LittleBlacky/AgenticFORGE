# ContextBuilder 演进实现解析文档（Token 计数 / Tokenizer / MMR 多样性 / 缓存）

## 1. 背景与目标
- **背景**：初版 `ContextBuilder` 中 token 计数为粗略估算，Select 阶段缺少多样性策略；引入真实 tokenizer 后，重复计数也可能带来额外开销。
- **目标**：
  1. 支持自定义 token 计数器（便于接入真实 tokenizer）。
  2. 支持真实 tokenizer：基于 `js-tiktoken`，并提供可选依赖回退。
  3. 支持 lazy 单例 tokenizer（按 `encodingName` 缓存）。
  4. **仅保留显式 `encodingName` 配置**，避免 SDK 维护模型映射表。
  5. 引入 MMR 多样性策略，降低内容冗余。
  6. 引入按段落/包级别 token 缓存，减少重复计数。

## 2. 核心组件与职责
### 2.1 TokenCounter 与配置注入
- `TokenCounter` 类型用于描述可插拔的 token 计数函数。
- `ContextConfig` 增加 `tokenCounter` 字段，支持注入真实计数器。
- `ContextPacketBuilder.create` 接受 `tokenCounter`，构造 `ContextPacket` 时计算 token 数。

```18:71:src/context/ContextBuilder.ts
export type TokenCounter = (text: string) => number;

export interface ContextConfig {
  maxTokens?: number;
  reserveRatio?: number;
  minRelevance?: number;
  enableMmr?: boolean;
  mmrLambda?: number;
  systemPromptTemplate?: string;
  enableCompression?: boolean;
  tokenCounter?: TokenCounter;
}

export class ContextPacketBuilder {
  static create(
    content: string,
    metadata: Record<string, unknown> = {},
    tokenCounter: TokenCounter = roughCountTokens,
  ): ContextPacket {
    return {
      content,
      metadata,
      timestamp: new Date(),
      tokenCount: tokenCounter(content),
      relevanceScore: 0,
    };
  }
}
```

### 2.2 Tokenizer（显式 encodingName）
- `Tokenizer` 只接受 `encodingName`，不再维护模型名映射表。
- 这样可以避免 SDK 维护成本与规则歧义。

```8:30:src/context/tokenizer.ts
export interface TokenizerOptions {
  encodingName?: string;
}

export class Tokenizer {
  private static readonly encodingCache = new Map<string, TiktokenEncoding | null>();
  private readonly encodingName: string;

  constructor(options: TokenizerOptions = {}) {
    this.encodingName = options.encodingName ?? "cl100k_base";
  }
}
```

### 2.3 Lazy 单例缓存
- `Tokenizer.encodingCache` 以 `encodingName` 为 key 缓存编码实例。
- 避免重复初始化 `js-tiktoken`。

```14:44:src/context/tokenizer.ts
export class Tokenizer {
  private static readonly encodingCache = new Map<string, TiktokenEncoding | null>();
  private readonly encodingName: string;

  constructor(options: TokenizerOptions = {}) {
    this.encodingName = options.encodingName ?? "cl100k_base";
  }

  countTokens(text: string): number {
    if (!text) return 0;
    const encoding = this.getEncoding();
    if (!encoding) return roughCountTokens(text);
    return encoding.encode(text).length;
  }

  private getEncoding(): TiktokenEncoding | null {
    if (Tokenizer.encodingCache.has(this.encodingName)) {
      return Tokenizer.encodingCache.get(this.encodingName) ?? null;
    }

    const loaded = tryLoadEncoding(this.encodingName);
    Tokenizer.encodingCache.set(this.encodingName, loaded);
    return loaded;
  }
}
```

### 2.4 构造器默认注入
- `ContextBuilder` 构造函数默认把 `roughCountTokens` 注入为 `tokenCounter`，保持向后兼容。

```79:104:src/context/ContextBuilder.ts
  constructor(options: ContextBuilderOptions = {}) {
    this.memoryTool = options.memoryTool ?? null;
    this.ragTool = options.ragTool ?? null;
    this.config = {
      maxTokens: 8000,
      reserveRatio: 0.15,
      minRelevance: 0.3,
      enableMmr: true,
      mmrLambda: 0.7,
      systemPromptTemplate: "",
      enableCompression: true,
      tokenCounter: roughCountTokens,
      ...options.config,
    };
  }
```

### 2.5 MMR 多样性选择（向量相似度）
- 引入 `selectWithMmr`，基于 **相关性** 与 **多样性惩罚** 计算 MMR 分数。
- 多样性惩罚优先使用 **向量余弦相似度**，失败时回退到词集合重叠。

```215:330:src/context/ContextBuilder.ts
  private async selectWithMmr(params: {
    candidates: ContextPacket[];
    tokenBudget: number;
    lambda: number;
    embedder: TextEmbedder;
  }): Promise<ContextPacket[]> {
    const selected: ContextPacket[] = [];
    const remaining = [...params.candidates];
    let usedTokens = 0;
    const lambda = Math.max(0, Math.min(1, params.lambda));

    const vectorCache = new Map<string, number[]>();
    const vectors = await this.embedPackets(
      params.candidates,
      params.embedder,
      vectorCache,
    );

    const lexicalSimilarity = (a: ContextPacket, b: ContextPacket): number => {
      const tokensA = new Set(a.content.toLowerCase().split(/\s+/).filter(Boolean));
      const tokensB = new Set(b.content.toLowerCase().split(/\s+/).filter(Boolean));
      if (tokensA.size === 0 || tokensB.size === 0) return 0;

      let overlap = 0;
      for (const token of tokensA) {
        if (tokensB.has(token)) overlap += 1;
      }
      const union = tokensA.size + tokensB.size - overlap;
      return union === 0 ? 0 : overlap / union;
    };

    const cosine = (a: number[] | null, b: number[] | null): number => {
      if (!a || !b || a.length === 0 || b.length === 0) return 0;
      let dot = 0;
      let normA = 0;
      let normB = 0;
      const len = Math.min(a.length, b.length);
      for (let i = 0; i < len; i++) {
        const va = a[i]!;
        const vb = b[i]!;
        dot += va * vb;
        normA += va * va;
        normB += vb * vb;
      }
      if (normA === 0 || normB === 0) return 0;
      return dot / (Math.sqrt(normA) * Math.sqrt(normB));
    };

    while (remaining.length > 0 && usedTokens < params.tokenBudget) {
      let bestIndex = -1;
      let bestScore = -Infinity;

      for (let i = 0; i < remaining.length; i++) {
        const candidate = remaining[i]!;
        if (usedTokens + candidate.tokenCount > params.tokenBudget) {
          continue;
        }

        let diversityPenalty = 0;
        if (selected.length > 0) {
          let maxSimilarity = 0;
          for (const chosen of selected) {
            const vectorSim = cosine(
              vectors.get(candidate) ?? null,
              vectors.get(chosen) ?? null,
            );
            const sim = vectorSim > 0 ? vectorSim : lexicalSimilarity(candidate, chosen);
            if (sim > maxSimilarity) maxSimilarity = sim;
          }
          diversityPenalty = maxSimilarity;
        }

        const mmrScore = lambda * candidate.relevanceScore - (1 - lambda) * diversityPenalty;
        if (mmrScore > bestScore) {
          bestScore = mmrScore;
          bestIndex = i;
        }
      }

      if (bestIndex < 0) break;

      const bestPacket = remaining.splice(bestIndex, 1)[0]!;
      selected.push(bestPacket);
      usedTokens += bestPacket.tokenCount;
    }

    return selected;
  }
```

## 3. 关键流程（结合代码）
### 3.1 Gather 阶段的 token 计数更新
- `build` 阶段创建按文本内容缓存的计数器，避免重复计算。

```96:144:src/context/ContextBuilder.ts
  async build(params: {
    userQuery: string;
    conversationHistory?: Message[];
    systemInstructions?: string | null;
    additionalPackets?: ContextPacket[];
  }): Promise<string> {
    const tokenCache = new Map<string, number>();
    const cachedCounter: TokenCounter = (text) => {
      const cached = tokenCache.get(text);
      if (cached !== undefined) return cached;
      const count = this.config.tokenCounter(text);
      tokenCache.set(text, count);
      return count;
    };

    const packets = await this.gather({
      userQuery: params.userQuery,
      conversationHistory: params.conversationHistory ?? [],
      systemInstructions: params.systemInstructions ?? null,
      additionalPackets: params.additionalPackets ?? [],
      tokenCounter: cachedCounter,
    });
```

### 3.2 Select 阶段的策略切换
- `enableMmr` 为 `true` 时启用 MMR；否则按相关性优先填充预算。

```141:203:src/context/ContextBuilder.ts
    if (this.config.enableMmr) {
      const mmrSelected = this.selectWithMmr({
        candidates: filtered,
        tokenBudget: availableTokens - usedTokens,
        lambda: this.config.mmrLambda,
      });
      for (const packet of mmrSelected) {
        selected.push(packet);
        usedTokens += packet.tokenCount;
      }
    } else {
      for (const packet of filtered) {
        if (usedTokens + packet.tokenCount > availableTokens) continue;
        selected.push(packet);
        usedTokens += packet.tokenCount;
      }
    }
```

## 4. 关键机制与实现细节
- **token 计数可插拔**：`tokenCounter` 由配置注入。
- **显式 encodingName**：SDK 不维护模型映射表，避免持续维护成本。
- **lazy 单例缓存**：按 `encodingName` 缓存 `js-tiktoken` 实例。
- **包级 token 计数缓存**：构建过程使用 `cachedCounter`，避免重复计算。
- **MMR 打分**：`mmrScore = λ * relevance - (1 - λ) * diversityPenalty`。
  - 多样性惩罚优先向量相似度；若向量为空或失败，回退到词集合重叠。
- **向量缓存（LRU）**：`embedPackets` 使用 `LruCache`（`src/utils/lruCache.ts`）按 `content` 复用向量，避免重复 embed。

## 5. 例子（从输入到输出）
### 场景
- 用户问题："如何在项目中接入 RAG？"
- 候选包：`related_memory` + `knowledge_base` 多条相似片段。

### 关键步骤
1. `build` 阶段对重复文本进行 token 缓存。
2. `select` 阶段启用 MMR，降低冗余片段权重。
3. `structure` 输出更紧凑的 `Evidence`。

### 结果
- 证据段更集中，重复内容减少。

## 6. 可靠性与降级策略
- **js-tiktoken 缺失**：自动回退到 `roughCountTokens`。
- **MMR 关闭**：退回相关性优先填充策略。
- **token 预算不足**：`compress` 按行截断保结构。
- **向量编码失败**：回退到词集合相似度，避免多样性计算失效。

## 7. 局限与演进建议
- 当前 MMR 相似度为词集合重叠，语义相似度较弱，可升级为向量相似度。
- token 缓存以文本为 key，极长文本可能带来内存占用，可考虑 LRU。
- 后续可引入 **冗余检测阈值** 与 **分区权重**（例如 Evidence 优先级更高）。
