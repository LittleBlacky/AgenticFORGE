# Zod / Schema / FunctionTool 类型设计记录

> 本文已合并原 `zod-schema-func-architecture-brief.md` 一页复盘内容，作为唯一版本维护。

## 一页复盘（Quick Brief）

### 1) 问题定义

我们要同时解决三件事：

- 模型输出如何稳定解析（协议）
- 参数错误如何在运行时拦截（安全）
- 开发者如何少写重复类型（体验）

### 2) 关键决策

- **决策 A：调用协议统一 JSON**
  - `{"name":"toolName","arguments":{"a":1,"b":2}}`
- **决策 B：函数工具执行前统一 schema 校验**
  - `schema.parse(arguments)` 通过后再执行 `func(args)`
- **决策 C：`func` 参数类型与 schema 绑定**
  - 通过 `defineFunctionTool` 保证编译期一致

### 3) 最终架构结论

**JSON 协议 + Zod 校验 + 类型绑定的函数工具定义**

### 4) 30 秒口述模板

> 我们最初函数工具是字符串入参，后来发现 Agent 场景下模型参数漂移很常见，单靠 TS 类型不够，因为运行时类型会被擦除。于是把调用协议统一成 JSON，并在执行前统一做 Zod 校验。再通过 `defineFunctionTool` 把 schema 和 func 参数类型绑定，保证编译期和运行期一致。最终在稳定性、可维护性和开发体验之间取得了最佳平衡。

---

## 背景

在 `SimpleAgent` 的工具调用能力演进中，我们经历了以下阶段：

1. 早期函数工具以 `func(input: string)` 为主，参数通过字符串解析。
2. 工具调用协议逐步收敛为统一 JSON：
   - `{"name": "toolName", "arguments": {...}}`
3. 需要让函数工具既有运行时安全（参数校验），又有良好开发体验（类型提示与约束）。

因此，这份记录聚焦三个核心问题：

- `schema` 是否应该存在、是否必填？
- `func` 参数类型如何和 `schema` 保持一致？
- 是否采用自动生成 schema（如 `ts-to-zod`）？

---

## 目标

我们最终想同时满足：

1. **协议稳定**：模型调用格式可解析、可约束。
2. **运行时安全**：参数错误能被明确拦截。
3. **开发体验好**：调用方尽量少写重复类型定义。
4. **易于推广**：SDK 使用者不必承担复杂工程链路。

---

## 方案对比与思考过程

### 方案 A：仅靠 `func` 类型，不写 schema

示例：

```ts
func: (args: { a: number; b: number }) => string
```

**优点**
- 写法直观，TS 提示好。

**问题**
- TS 类型只存在编译期，运行时会被擦除。
- 模型返回 `number1/number2` 这类漂移字段时，无法在执行前稳定拦截。
- 工具错误会变成业务代码内部异常，定位成本更高。

**结论**
- 不足以支撑 Agent 场景，不采用。

---

### 方案 B：只要 schema，`func(args: Record<string, any>)`

**优点**
- 运行时安全强。
- 调用链简单。

**问题**
- `func` 参数失去精确类型提示，开发体验差。
- 用户仍会手动断言类型，重复劳动。

**结论**
- 安全性可接受，但 DX 不理想，不是最优解。

---

### 方案 C（最终采用）：JSON 协议 + Zod schema + 类型绑定的 `func`

核心思想：

- 模型层统一 JSON 协议。
- 执行层统一 `schema.parse(arguments)`。
- 类型层让 `func` 参数类型与 schema 绑定（通过泛型/工厂函数）。

示例（推荐）：

```ts
const addTool = defineFunctionTool({
  name: "calculatorAdd",
  description: "计算两个数字的和",
  schema: z.object({ a: z.number(), b: z.number() }),
  func: (args) => String(args.a + args.b),
});
```

**优点**
- 协议、运行时、类型系统三层一致。
- 参数错误会在执行前输出明确校验信息。
- `func` 参数可获得强类型推导。

**代价**
- 需要提供 schema（手写或生成）。

**结论**
- 在安全性与开发效率之间达到最佳平衡，采用。

---

## 为什么保留 JSON 调用协议

曾讨论过是否回到旧格式（如 `[TOOL_CALL:xxx:yyy]`）。

最终保留 JSON 的原因：

1. **结构化强**：天然支持嵌套对象、数组与复杂参数。
2. **解析稳定**：可按对象边界提取，减少歧义。
3. **与 Zod 完全契合**：`arguments` 直接进入 `schema.parse(...)`。
4. **可观测性好**：日志中可直接看到调用对象。

---

## schema 是否必须

### 工程立场

- **推荐：函数工具默认要求 schema**（尤其生产场景）。
- 对实验性场景可留出无 schema 的宽松模式，但不作为默认最佳实践。

### 原因

- Agent 的输入来自模型，不是强类型调用方；字段漂移常见。
- schema 是运行时“最后一道防线”。

---

## “不想手写 schema” 的取舍

我们评估了 `ts-to-zod`：

### 可行点
- 先写 TypeScript interface，再生成 zod schema。
- 避免手工维护两份结构。

### 风险与约束
- 这是构建期能力，不是运行时自动推导。
- 需要生成脚本与工程约束（prebuild / predev）。
- 对复杂高级类型可能有边界。

### 团队建议
- SDK 内部/大项目可用 `ts-to-zod`。
- SDK 对外文档优先推荐“手写 schema + defineFunctionTool”，门槛更低。

---

## 最终设计原则（落地版）

1. **调用协议统一 JSON**：`name + arguments`。
2. **函数工具执行前统一校验**：`schema.parse(arguments)`。
3. **func 参数类型与 schema 绑定**：通过 `defineFunctionTool` 保证一致。
4. **不依赖运行时类型反射**：避免不可控推断。
5. **生成工具可选，不强依赖**：`ts-to-zod` 是增强项，不是必须项。

---

## 未来可演进方向

1. 新增严格模式开关：无 schema 的函数工具在注册时直接报错。
2. 完善错误分层：区分“模型参数错误 / schema 校验失败 / 工具执行异常”。
3. 输出更结构化工具描述，帮助模型更精准生成 `arguments`。
4. 提供更短的 helper API，进一步降低定义成本。

---

## 一句话总结

我们选择的是：

**JSON 协议保证可解析，Zod schema 保证运行时安全，`defineFunctionTool` 保证类型一致性。**

这是一套兼顾稳定性、可维护性和开发体验的中长期方案。
