# Action Schema 分层校验 详细解析文档

## 1. 背景与目标

`MemoryTool` 的 `run(parameters)` 入口之前采用“单层参数列表 + 运行期分发”的方式，虽然能覆盖多种 action，但存在两个问题：

1. **action 级必填字段不可约束**：比如 `add` 缺少 `content`、`update` 缺少 `memory_id` 时，早期无法被拦截。
2. **参数歧义与容错过大**：所有参数都在一个 schema 中，导致不同 action 的参数边界不清晰。

因此引入“按 action 分层的结构化 schema”，实现**通用校验 + action 细粒度校验**的双阶段校验链路。

文件位置：`src/tools/builtin/memory.ts`

---

## 2. 核心组件与职责

### 2.1 通用校验：Tool 的 runtime schema

`Tool` 基类仍提供 `validateAndNormalizeParameters`，用于：

- 基础字段类型校验
- 默认值注入
- 合法字段裁剪（`strict`）

### 2.2 action 结构化 schema（新增）

在 `MemoryTool` 内新增 `MemoryActionSchemas`：

- 每个 action 对应一份结构化 schema
- 强制 action 级必填字段
- 允许不同 action 使用不同参数集合

---

## 3. 关键流程（结合代码）

### 3.1 Schema 定义

`MemoryActionSchemas` 将各 action 的字段明确拆分：

```28:94:src/tools/builtin/memory.ts
type MemoryActionSchemas = {
  add: z.ZodObject<{
    action: z.ZodLiteral<"add">;
    content: z.ZodString;
    memory_type: z.ZodOptional<z.ZodString>;
    importance: z.ZodOptional<z.ZodNumber>;
    file_path: z.ZodOptional<z.ZodString>;
    modality: z.ZodOptional<z.ZodString>;
  }>;
  search: z.ZodObject<{
    action: z.ZodLiteral<"search">;
    query: z.ZodString;
    limit: z.ZodOptional<z.ZodNumber>;
    memory_type: z.ZodOptional<z.ZodString>;
    min_importance: z.ZodOptional<z.ZodNumber>;
  }>;
  summary: z.ZodObject<{
    action: z.ZodLiteral<"summary">;
    limit: z.ZodOptional<z.ZodNumber>;
  }>;
  stats: z.ZodObject<{
    action: z.ZodLiteral<"stats">;
  }>;
  update: z.ZodObject<{
    action: z.ZodLiteral<"update">;
    memory_id: z.ZodString;
    content: z.ZodOptional<z.ZodString>;
    importance: z.ZodOptional<z.ZodNumber>;
  }>;
  remove: z.ZodObject<{
    action: z.ZodLiteral<"remove">;
    memory_id: z.ZodString;
  }>;
  forget: z.ZodObject<{
    action: z.ZodLiteral<"forget">;
    strategy: z.ZodOptional<z.ZodString>;
    threshold: z.ZodOptional<z.ZodNumber>;
    max_age_days: z.ZodOptional<z.ZodNumber>;
  }>;
  consolidate: z.ZodObject<{
    action: z.ZodLiteral<"consolidate">;
    from_type: z.ZodOptional<z.ZodString>;
    to_type: z.ZodOptional<z.ZodString>;
    importance_threshold: z.ZodOptional<z.ZodNumber>;
  }>;
  clear_all: z.ZodObject<{
    action: z.ZodLiteral<"clear_all">;
  }>;
};
```

### 3.2 运行期双阶段校验

先进行通用校验，再基于 action 做二次校验：

```150:220:src/tools/builtin/memory.ts
  async run(parameters: Record<string, unknown>): Promise<string> {
    const validation = this.validateAndNormalizeParameters(parameters);
    if (!validation.success) {
      return `❌ 参数验证失败: ${validation.error}`;
    }

    const action = String(validation.data.action ?? "") as MemoryAction;
    const actionValidation = this.validateActionParameters(
      action,
      validation.data,
    );

    if (!actionValidation.success) {
      return `❌ 参数验证失败: ${actionValidation.error}`;
    }

    const p = actionValidation.data;

    switch (action) {
      case "add":
        return this.addMemory(
          p.content,
          this.toMemoryType(p.memory_type),
          this.toNumber(p.importance, 0.5),
          this.toOptionalString(p.file_path),
          this.toOptionalString(p.modality),
        );
      // ...
    }
  }
```

---

## 4. 关键机制与实现细节

### 4.1 “通用 schema + action schema”双层校验

- **第一层**：`Tool` 的 runtime schema 保证参数格式正确。
- **第二层**：action schema 保证“当前 action 的必填字段到位”。

### 4.2 action 级别必填字段

- `add` 必须提供 `content`
- `update/remove` 必须提供 `memory_id`
- `search` 必须提供 `query`

这部分在 schema 层强制约束，不再依赖运行期 `if` 分支判断。

### 4.3 输入兼容性

- action schema 只在通用校验通过后执行，避免重复报错。
- `validateAndNormalizeParameters` 仍负责默认值注入，保证旧调用最小破坏。

---

## 5. 例子（从输入到输出）

### 场景：`update` 缺少 `memory_id`

**输入参数**：

```json
{"action": "update", "content": "新内容"}
```

**处理流程**：

1. 通用校验通过
2. action schema 校验失败（缺少 `memory_id`）
3. 返回：

```
❌ 参数验证失败: memory_id: Required
```

---

## 6. 可靠性与降级策略

- **严格边界**：action schema 确保“当前 action 参数集合”完整且一致。
- **错误清晰**：二次校验返回具体字段错误，便于调用方纠错。
- **默认值保留**：通用校验仍注入默认值，减少历史调用的破坏性。

---

## 7. 局限与演进建议

### 局限

1. action schema 仍是运行期校验，未形成强类型 action 分层接口。
2. tool schema（`getParameters`）与 action schema 有一定重复维护成本。

### 可落地演进

1. 抽象 action schema 与 tool schema 的统一配置源，减少双重维护。
2. 在 `@toolAction` 级别引入 schema，自动生成 action schema 与参数描述。
3. 进一步细化 action 参数类型（如 `strategy` 枚举化、`memory_type` 强类型化）。
