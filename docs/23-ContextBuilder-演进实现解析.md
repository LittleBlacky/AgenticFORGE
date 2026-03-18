# ContextBuilder 演进实现解析文档（Token 计数 / Tokenizer / MMR 多样性 / 缓存）

## 1. 背景与目标
- **背景**：在初版 `ContextBuilder` 中，token 计数使用粗略估算，Select 阶段缺少多样性策略；当引入真实 tokenizer 后，重复计数可能带来额外开销。
- **目标**：
  1. 支持自定义 token 计数器（便于接入真实 tokenizer）。
  2. 支持真实 tokenizer：基于 `js-tiktoken`，并提供可选依赖回退。
  3. 支持 **lazy 单例** tokenizer（按 encodingName 缓存）。
  4. 支持 **模型名 → encodingName** 的自动推断。
  5. 在 Select 阶段引入 MMR（Maximal Marginal Relevance）策略，降低内容冗余，提高多样性。
  6. 在构建过程中引入 **按段落/包级别 token 缓存**，减少重复计数。

## 2. 核心组件与职责
### 2.1 TokenCounter 与配置注入
- `TokenCounter` 类型用于描述可插拔的 token 计数函数。
- `ContextConfig` 增加 `tokenCounter` 字段，用于外部注入真实计数器。
- `ContextPacketBuilder.create` 接受 `tokenCounter`，用于构造 `ContextPacket` 时计算 token 数。

### 2.2 Tokenizer 与模型名自动推断
- `Tokenizer` 支持 `encodingName` 与 `model` 参数：
  - 未传 `encodingName` 时，会尝试根据 `model` 推断。
  - 再不命中时，回退到默认 `cl100k_base`。
- `MODEL_ENCODING_MAP` 维护模型到编码的映射规则。

```1:66:src/context/tokenizer.ts
import {createRequire} from "node:module";

type TiktokenEncoding = {encode: (text: string) => number[]};

type TiktokenModule = {
  getEncoding: (name: string) => TiktokenEncoding;
};

export interface TokenizerOptions {
  encodingName?: string;
  model?: string;
}

const MODEL_ENCODING_MAP: Array<{match: RegExp; encoding: string}> = [
  {match: /gpt-4o/i, encoding: "o200k_base"},
  {match: /gpt-4\.?1/i, encoding: "o200k_base"},
  {match: /gpt-4/i, encoding: "cl100k_base"},
  {match: /gpt-3\.5/i, encoding: "cl100k_base"},
  {match: /text-embedding-3/i, encoding: "cl100k_base"},
];

export class Tokenizer {
  private static readonly encodingCache = new Map<string, TiktokenEncoding | null>();
  private readonly encodingName: string;

  constructor(options: TokenizerOptions = {}) {
    this.encodingName =
      options.encodingName ??
      inferEncodingNameFromModel(options.model) ??
      "cl100k_base";
  }
```

### 2.3 Lazy 单例缓存
- `Tokenizer.encodingCache` 以 `encodingName` 作为 key 缓存编码实例。
- 避免反复初始化 `js-tiktoken`，提升构建性能。

```14:52:src/context/tokenizer.ts
export class Tokenizer {
  private static readonly encodingCache = new Map<string, TiktokenEncoding | null>();
  private readonly encodingName: string;

  constructor(options: TokenizerOptions = {}) {
    this.encodingName =
      options.encodingName ??
      inferEncodingNameFromModel(options.model) ??
      "cl100k_base";
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

参考实现：

```18:70:src/context/ContextBuilder.ts
export type TokenCounter = (text: string) => number;

export interface ContextConfig {
  maxTokens?: number; // 总预算
  reserveRatio?: number; // 生成余量（10-20%）
  minRelevance?: number; // 最小相关性阈值
  enableMmr?: boolean; // 启用最大边际相关性（多样性）
  mmrLambda?: number; // MMR平衡参数（0=纯多样性, 1=纯相关性）
  systemPromptTemplate?: string; // 系统提示模板
  enableCompression?: boolean; // 启用压缩
  tokenCounter?: TokenCounter; // 自定义 token 计数器
}

export class ContextPacketBuilder {
  static create(
    content: string,
    metadata: Record<string, unknown> = {},
    tokenCounter: TokenCounter = countTokens,
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

### 2.3 MMR 多样性选择
- 引入 `selectWithMmr`，在候选集中基于 **相关性** 与 **多样性惩罚** 计算 MMR 分数。
- 相似度使用 **Jaccard-like 词集合重叠**，避免过度重复内容。

```186:272:src/context/ContextBuilder.ts
  private selectWithMmr(params: {
    candidates: ContextPacket[];
    tokenBudget: number;
    lambda: number;
  }): ContextPacket[] {
    const selected: ContextPacket[] = [];
    const remaining = [...params.candidates];
    let usedTokens = 0;
    const lambda = Math.max(0, Math.min(1, params.lambda));

    const similarity = (a: ContextPacket, b: ContextPacket): number => {
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
            const sim = similarity(candidate, chosen);
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
- `gather` 内部统一使用 `tokenCounter` 计算每个 `ContextPacket` 的 token。

```114:179:src/context/ContextBuilder.ts
    const tokenCounter = this.config.tokenCounter;

    // P0: 系统指令（强约束）
    if (params.systemInstructions) {
      packets.push(
        ContextPacketBuilder.create(
          params.systemInstructions,
          {type: "instructions"},
          tokenCounter,
        ),
      );
    }

    // ... 其他 packet 构建均统一传入 tokenCounter
```

### 3.2 Select 阶段的策略切换
- 当 `enableMmr` 为 `true` 时，`select` 会用 `selectWithMmr` 做多样性选择。
- 当 `enableMmr` 为 `false` 时，退化为按相关性优先填充预算。

```141:185:src/context/ContextBuilder.ts
    const availableTokens = this.getAvailableTokens();
    const selected: ContextPacket[] = [];
    let usedTokens = 0;

    for (const packet of systemPackets) {
      if (usedTokens + packet.tokenCount <= availableTokens) {
        selected.push(packet);
        usedTokens += packet.tokenCount;
      }
    }

    if (this.config.enableMmr) {
      const remainingBudget = Math.max(0, availableTokens - usedTokens);
      const mmrSelected = this.selectWithMmr({
        candidates: filtered,
        tokenBudget: remainingBudget,
        lambda: this.config.mmrLambda,
      });
      selected.push(...mmrSelected);
      return selected;
    }

    for (const packet of filtered) {
      if (usedTokens + packet.tokenCount > availableTokens) continue;
      selected.push(packet);
      usedTokens += packet.tokenCount;
    }
```

## 4. 关键机制与实现细节
- **token 计数可插拔**：
  - `tokenCounter` 由配置注入，后续可替换为真实 tokenizer（如 tiktoken、gpt-tokenizer）。
- **MMR 打分**：
  - `mmrScore = λ * relevance - (1 - λ) * diversityPenalty`
  - 多样性惩罚使用候选与已选集合的最大相似度。

## 5. 例子（从输入到输出）
### 场景
- 用户问题："如何在项目中接入 RAG？"
- 候选包中包含：
  - `related_memory`: 多条关于 RAG 的对话历史
  - `knowledge_base`: 知识库检索片段

### 关键步骤
1. `gather` 阶段为每个片段计算 token 数。
2. `select` 阶段先放入 system 指令，再运行 MMR：
   - 当多个片段内容相似，MMR 会降低重复片段的选择概率。
3. 最终 `structure` 输出上下文，避免同质化证据堆叠。

### 结果
- 输出上下文中 `Evidence` 部分更集中，减少重复叙述。

## 6. 可靠性与降级策略
- **token 计数器缺失**：自动使用 `countTokens`（粗略估算）。
- **MMR 关闭**：若 `enableMmr=false`，退回原有相关性优先选择。
- **token 预算不足**：`compress` 会按行截断保结构。

## 7. 局限与演进建议
- 当前 MMR 相似度为词集合重叠，语义相似度较弱，可升级为向量相似度。
- token 计数默认仍为粗估，应在生产环境接入真实 tokenizer。
- 后续可引入 **冗余检测阈值** 与 **分区权重**（例如 Evidence 优先级更高）。
