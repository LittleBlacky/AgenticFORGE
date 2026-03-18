# ContextBuilder 详细解析文档（GSSC 上下文构建）

## 1. 背景与目标
- **为什么需要**：在多源信息（系统指令、记忆、RAG、对话历史）并存时，需要一个可控的上下文装配流程，保证输入模型的上下文既相关又可控预算。
- **范围与边界**：当前实现聚焦于「上下文构建」本身，不负责调用 LLM；仅提供 Gather/Select/Structure/Compress 流水线与最小可用的 token 预算策略。

## 2. 核心组件与职责
- **ContextPacket**：上下文载体，包含 `content`、`metadata`、`timestamp`、`tokenCount`、`relevanceScore`。
- **ContextPacketBuilder**：统一创建 `ContextPacket`，默认计算 token 数与时间戳。
- **ContextConfig**：配置项（预算、最小相关性、压缩开关等）。
- **ContextBuilder**：核心入口，负责执行 GSSC 流水线。

关键接口定义与入口方法如下：

```1:211:src/context/ContextBuilder.ts
export interface ContextPacket {
  content: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
  tokenCount: number;
  relevanceScore: number;
}

export class ContextBuilder {
  // ...
  async build(params: {
    userQuery: string;
    conversationHistory?: Message[];
    systemInstructions?: string | null;
    additionalPackets?: ContextPacket[];
  }): Promise<string> {
    // GSSC 主流程
  }
}
```

## 3. 关键流程（结合代码）

### 3.1 Gather（收集候选信息）
收集顺序与来源：
- **P0 系统指令**：如果存在，强制加入 `instructions` 类型。
- **P1 记忆**：调用 `MemoryTool.run` 做两次检索（任务状态、相关记忆）。
- **P2 RAG**：调用 `RagTool.run` 做知识库检索。
- **P3 对话历史**：保留最近 10 条上下文。

```74:170:src/context/ContextBuilder.ts
  private async gather(params: {
    userQuery: string;
    conversationHistory: Message[];
    systemInstructions: string | null;
    additionalPackets: ContextPacket[];
  }): Promise<ContextPacket[]> {
    const packets: ContextPacket[] = [];

    // P0: 系统指令（强约束）
    if (params.systemInstructions) {
      packets.push(
        ContextPacketBuilder.create(params.systemInstructions, {type: "instructions"}),
      );
    }

    // P1: 从记忆中获取任务状态与关键结论
    if (this.memoryTool) {
      try {
        const stateResults = await this.memoryTool.run({
          action: "search",
          query: "(任务状态 OR 子目标 OR 结论 OR 阻塞)",
          min_importance: 0.7,
          limit: 5,
        });
        // ...
      } catch (error) {
        console.warn("⚠️ 记忆检索失败:", error);
      }
    }

    // P2: 从RAG中获取事实证据
    if (this.ragTool) {
      try {
        const ragResults = await this.ragTool.run({
          action: "search",
          query: params.userQuery,
          limit: 5,
        });
        // ...
      } catch (error) {
        console.warn("⚠️ RAG检索失败:", error);
      }
    }

    // P3: 对话历史（辅助材料）
    if (params.conversationHistory.length > 0) {
      const recentHistory = params.conversationHistory.slice(-10);
      const historyText = recentHistory
        .map((msg) => `[${msg.role}] ${msg.content}`)
        .join("\n");
      packets.push(
        ContextPacketBuilder.create(historyText, {
          type: "history",
          count: recentHistory.length,
        }),
      );
    }

    packets.push(...params.additionalPackets);
    return packets;
  }
```

### 3.2 Select（筛选与排序）
筛选策略分为三步：
1. **相关性**：基于 `userQuery` 与 `content` 的关键词重叠计算 `relevanceScore`。
2. **新近性**：使用指数衰减函数计算 `recencyScore`。
3. **综合排序**：综合分 `score = 0.7 * relevance + 0.3 * recency`。

筛选规则：
- `instructions` 类型强制保留。
- 其他包要求 `relevanceScore >= minRelevance`。
- 预算内顺序填充，超出预算直接跳过。

```172:259:src/context/ContextBuilder.ts
  private select(packets: ContextPacket[], userQuery: string): ContextPacket[] {
    const queryTokens = new Set(userQuery.toLowerCase().split(/\s+/).filter(Boolean));

    for (const packet of packets) {
      const contentTokens = new Set(
        packet.content.toLowerCase().split(/\s+/).filter(Boolean),
      );
      if (queryTokens.size > 0) {
        let overlap = 0;
        for (const token of queryTokens) {
          if (contentTokens.has(token)) overlap += 1;
        }
        packet.relevanceScore = overlap / queryTokens.size;
      } else {
        packet.relevanceScore = 0;
      }
    }

    const recencyScore = (timestamp: Date): number => {
      const deltaSeconds = Math.max((Date.now() - timestamp.getTime()) / 1000, 0);
      const tau = 3600;
      return Math.exp(-deltaSeconds / tau);
    };

    const scored = packets.map((packet) => {
      const recency = recencyScore(packet.timestamp);
      const score = 0.7 * packet.relevanceScore + 0.3 * recency;
      return {score, packet};
    });

    // ... instructions 强制保留，minRelevance 过滤，预算填充
  }
```

### 3.3 Structure（结构化输出）
输出模板分区：
- `[Role & Policies]`：系统指令
- `[Task]`：用户问题
- `[State]`：任务状态
- `[Evidence]`：记忆/RAG/工具检索证据
- `[Context]`：对话历史
- `[Output]`：回答格式约束

```262:343:src/context/ContextBuilder.ts
  private structure(params: {
    selectedPackets: ContextPacket[];
    userQuery: string;
    systemInstructions: string | null;
  }): string {
    const sections: string[] = [];

    const p0Packets = params.selectedPackets.filter(
      (packet) => packet.metadata.type === "instructions",
    );
    if (p0Packets.length > 0) {
      const roleSection = ["[Role & Policies]", ...p0Packets.map((p) => p.content)].join(
        "\n",
      );
      sections.push(roleSection);
    }

    sections.push(`[Task]\n用户问题：${params.userQuery}`);

    // ... State / Evidence / Context

    const outputSection =
      "[Output]\n" +
      "请按以下格式回答：\n" +
      "1. 结论（简洁明确）\n" +
      "2. 依据（列出支撑证据及来源）\n" +
      "3. 风险与假设（如有）\n" +
      "4. 下一步行动建议（如适用）";
    sections.push(outputSection);

    return sections.join("\n\n");
  }
```

### 3.4 Compress（预算压缩）
- 使用 `countTokens` 估算 token 数。
- 若超预算，逐行累加，直到预算上限。

```345:396:src/context/ContextBuilder.ts
  private compress(context: string): string {
    if (!this.config.enableCompression) return context;

    const currentTokens = countTokens(context);
    const availableTokens = this.getAvailableTokens();
    if (currentTokens <= availableTokens) return context;

    console.warn(
      `⚠️ 上下文超预算 (${currentTokens} > ${availableTokens})，执行截断`,
    );

    const lines = context.split("\n");
    const compressed: string[] = [];
    let usedTokens = 0;

    for (const line of lines) {
      const lineTokens = countTokens(line);
      if (usedTokens + lineTokens > availableTokens) break;
      compressed.push(line);
      usedTokens += lineTokens;
    }

    return compressed.join("\n");
  }
```

## 4. 关键机制与实现细节
- **相关性策略**：关键词重叠作为基础信号，避免引入 embedding 依赖。
- **新近性衰减**：指数衰减保证旧信息权重下降。
- **预算控制**：统一用 `getAvailableTokens()` 计算可用预算。
- **Token 估算**：`countTokens` 使用字符数/4 的估算策略（轻量、跨平台）。

```398:405:src/context/ContextBuilder.ts
export function countTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}
```

## 5. 例子（从输入到输出）
**场景**：用户询问“如何接入记忆工具”，系统有历史对话与记忆工具可用。

1. **输入**
   - `userQuery`: “如何接入记忆工具”
   - `systemInstructions`: “你是 SDK 教程助手”
   - `conversationHistory`: 最近 10 条对话
2. **Gather**
   - P0 加入系统指令
   - P1 通过 `MemoryTool.run` 返回与“接入记忆工具”相关记录
   - P3 追加历史对话文本
3. **Select**
   - 计算关键词重叠，筛掉低相关内容
   - 保留系统指令与高相关记忆
4. **Structure**
   - 生成 `[Role & Policies]`、`[Task]`、`[Evidence]`、`[Context]` 等段落
5. **Compress**
   - 若超预算按行截断

输出结果是一个结构化的上下文字符串，可直接注入给 LLM。

## 6. 可靠性与降级策略
- **记忆/RAG 失败**：`gather` 中捕获异常并 `console.warn`，不阻塞主流程。
- **无检索结果**：遇到“未找到/错误”直接跳过，不加入无效 packet。
- **预算不足**：按行截断保留结构，避免整段丢失。

## 7. 局限与演进建议
- **局限**
  - 相关性计算基于关键词，无法理解语义。
  - `enableMmr` 与 `mmrLambda` 尚未启用实际多样性选择。
  - token 计算为估算，无法严格对齐真实模型。

- **下一步建议**
  1. 引入向量相似度或 embedding 相关性。
  2. 实现 MMR 多样性选择策略。
  3. 接入真实 tokenizer（可选）以精确预算控制。
  4. 将 `[Output]` 约束模板配置化。
