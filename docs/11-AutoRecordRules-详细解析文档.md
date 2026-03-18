# AutoRecordRules 详细解析文档

## 1. 背景与目标

`autoRecordConversation` 是 `MemoryTool` 的自动对话记录入口。为解决“噪声记忆过多、写入策略不可控”的问题，引入 `AutoRecordRules`：

- **可配置化**：允许业务按场景调节是否写入、写入对象、触发阈值与重要性权重。
- **稳定默认行为**：默认规则与原先行为一致，避免破坏旧逻辑。
- **可扩展**：未来可引入更复杂的语义判别或策略分层。

文件位置：`src/tools/builtin/memory.ts`

---

## 2. 核心组件与职责

### 2.1 `AutoRecordRules`

`AutoRecordRules` 是自动记录策略的结构化配置，控制对话自动写入的关键行为：

- 启用/关闭自动记录
- 选择写入对象（用户/助手）
- 选择是否写入 `episodic` 对话摘要
- `working` / `episodic` 重要性权重
- `episodic` 触发条件（长度阈值/关键字）

### 2.2 `MemoryToolOptions`

`MemoryToolOptions` 新增 `autoRecordRules` 字段用于传入配置。构造器会将其与默认规则合并，确保默认行为不变。

---

## 3. 关键流程（结合代码）

### 3.1 构造器合并默认规则

构造器将默认规则与外部输入合并，确保未配置时保持原有行为。

```132:169:src/tools/builtin/memory.ts
    this.autoRecordRules = {
      enabled: true,
      includeUser: true,
      includeAssistant: true,
      enableEpisodic: true,
      workingImportance: 0.6,
      episodicImportance: 0.8,
      minLengthForEpisodic: 100,
      keywordsForEpisodic: ["重要", "记住"],
      ...(options.autoRecordRules ?? {}),
    };
```

### 3.2 自动记录入口

`autoRecordConversation` 在每轮对话中调用，遵循规则决定是否写入：

```439:505:src/tools/builtin/memory.ts
  async autoRecordConversation(
    userInput: string,
    agentResponse: string,
  ): Promise<void> {
    this.conversationCount += 1;

    if (!this.autoRecordRules.enabled) return;

    const workingImportance = this.clamp01(
      this.autoRecordRules.workingImportance,
      0.6,
    );
    const episodicImportance = this.clamp01(
      this.autoRecordRules.episodicImportance,
      0.8,
    );

    if (this.autoRecordRules.includeUser) {
      await this.addMemory(`用户: ${userInput}`, "working", workingImportance);
    }
    if (this.autoRecordRules.includeAssistant) {
      await this.addMemory(
        `助手: ${agentResponse}`,
        "working",
        workingImportance,
      );
    }

    if (this.autoRecordRules.enableEpisodic) {
      const minLength = Math.max(0, this.autoRecordRules.minLengthForEpisodic);
      const keywords = this.autoRecordRules.keywordsForEpisodic;
      const hitKeyword = keywords.some((k) =>
        userInput.includes(k) || agentResponse.includes(k),
      );
      const hitLength =
        userInput.length + agentResponse.length >= Math.max(1, minLength);

      if (hitKeyword || hitLength) {
        await this.addMemory(
          `对话 - 用户: ${userInput}\n助手: ${agentResponse}`,
          "episodic",
          episodicImportance,
        );
      }
    }
  }
```

---

## 4. 关键机制与实现细节

### 4.1 开关与对象筛选

- `enabled` 为 `false` 时直接返回，避免任何自动写入。
- `includeUser` / `includeAssistant` 控制是否分别写入 `working` 记忆。

### 4.2 重要性权重与边界

- `workingImportance` 与 `episodicImportance` 会通过 `clamp01` 归一化到            [0, 1]。
- 默认值分别为 0.6 / 0.8，与旧逻辑一致。

### 4.3 `episodic` 触发条件

- `enableEpisodic` 决定是否允许写入 `episodic`。
- `minLengthForEpisodic` + `keywordsForEpisodic` 作为“长度阈值 + 关键字命中”的双触发策略：
  - **命中关键字**：`userInput` 或 `agentResponse` 里包含任意关键字
  - **命中长度**： `userInput.length + agentResponse.length >= minLengthForEpisodic`

---

## 5. 例子（从输入到输出）

### 场景：产品对话需要抑制噪声

**输入配置**：仅记录用户输入，关闭 `episodic`，降低 `working` 重要性。

```ts
const memoryTool = new MemoryTool({
  autoRecordRules: {
    includeAssistant: false,
    enableEpisodic: false,
    workingImportance: 0.4,
  },
});
```

**输入对话**：

- 用户：“今天把登录页换成新版 UI”
- 助手：“已记录，我会在后续协助时保持一致”

**处理过程**：

1. `enabled` 为 true，继续执行
2. `includeUser` 为 true → 写入 `working`（importance = 0.4）
3. `includeAssistant` 为 false → 不写入助手对话
4. `enableEpisodic` 为 false → 不写入 `episodic`

**输出结果**：

- 仅一条 `working` 记忆被写入

---

## 6. 可靠性与降级策略

- **非法重要性**：通过 `clamp01` 归一化，避免非法权重造成异常。
- **关键字未配置**：默认关键字存在，避免遗漏。
- **长度阈值负值**：被 `Math.max(0, minLength)` 修正为 0。

---

## 7. 局限与演进建议

### 局限

1. 触发策略仍是“关键字 + 长度”，缺少更精细的语义判断。
2. `episodic` 写入内容固定格式，无法按业务场景定制摘要模板。
3. 规则只在 `MemoryTool` 生效，尚未形成跨工具统一策略。

### 可落地演进

1. 引入可插拔策略（例如：`AutoRecordStrategy` 接口）
2. 支持基于角色标签/会话主题的策略分层
3. 接入轻量语义评分（embedding 相似度或 rerank）辅助判断是否写入 `episodic`
