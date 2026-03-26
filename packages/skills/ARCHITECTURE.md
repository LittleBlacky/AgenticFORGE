# @agenticforge/skills 架构解析文档

## 1. 背景与目标

### 为什么需要 Skills 系统？

传统 Agent 框架通常将「能做什么」和「怎么做」混在一起，导致：

- 单一 Agent 承载所有职责，System Prompt 越来越长，质量下降
- 不同场景的工具、提示词耦合在一起，难以维护
- 无法在不修改代码的情况下为 Agent 增加新能力

**Skills 系统**将 Agent 的能力拆分为独立单元，每个 Skill 只关注一个业务域，Agent 负责「路由」而不是「实现」。

### 设计目标

| 目标 | 实现方式 |
|------|----------|
| 能力可插拔 | Skill 通过 `SkillRegistry` 动态注册/注销 |
| 框架无关 | `SkillRunner` 不依赖 Agent 基类，可独立使用 |
| 非开发者可维护 | `MarkdownSkill` 让任何人用 `.md` 文件定义 Skill |
| 自动意图路由 | LLM 读取所有 Skill 的 description，自动选择最合适的 |
| 类型安全 | TypeScript 接口约束所有扩展点 |

### 范围与边界

- **在 scope 内**：Skill 定义、注册、路由、执行、Markdown 加载
- **不在 scope 内**：对话历史管理（由 `@agenticforge/agents` 的 `SkillAgent` 负责）、工具发现与注册（由 `@agenticforge/tools` 负责）

---

## 2. 核心组件与职责

```
@agenticforge/skills
│
├── types.ts          SkillContext / SkillResult / SkillDefinition / IAgentSkill
│                     ── 系统的「契约层」，所有组件通过接口通信
│
├── AgentSkill.ts     可继承的 Skill 基类
│                     ── 实现默认 execute()：LLM 调用 + 工具调用循环
│
├── SkillRegistry.ts  Skill 注册中心
│                     ── Map<name, IAgentSkill> + 路由描述生成
│
├── SkillRunner.ts    框架无关的调度器
│                     ── 意图路由 + Skill 执行 + Fallback
│
├── MarkdownSkill.ts  从 .md 文件构建 Skill
│                     ── frontmatter 解析 + 正文作为 system prompt
│
└── SkillLoader.ts    批量加载 .md Skill 文件
                      ── 目录扫描 + 递归 walk + SkillRegistry 构建
```

### 依赖关系图

```
types.ts (接口)
    ▲
    │ implements
    ├── AgentSkill.ts
    └── MarkdownSkill.ts

SkillRegistry.ts
    ├── 依赖 IAgentSkill (types.ts)
    └── 依赖 AgentSkill（用于 instanceof 判断生成 describe）

SkillRunner.ts
    ├── 依赖 SkillRegistry
    └── 依赖 IAgentSkill / SkillContext / SkillResult

SkillLoader.ts
    ├── 依赖 MarkdownSkill（生成实例）
    ├── 依赖 IAgentSkill
    └── 依赖 SkillRegistry（toRegistry 方法）
```

---

## 3. 核心类型系统（types.ts）

### SkillContext — 调用时注入的上下文

```typescript
export interface SkillContext {
  query: string;                                            // 当前用户输入
  metadata?: Record<string, unknown>;                       // 调用方任意元数据
  history?: Array<{role: "user"|"assistant"|"system"; content: string}>; // 对话历史
}
```

`SkillContext` 是 Skill 与外部世界的**唯一信息通道**。调用方（`SkillRunner` 或 `SkillAgent`）在执行 Skill 之前构建好 context，Skill 的 `execute()` 只读取 context，不直接访问外部状态。

**`metadata` 的典型用途：**
- 用户身份与权限（`{ userId, role }`）
- 会话 ID（`{ sessionId }`）
- A/B 测试标记（`{ variant: "b" }`）
- 调用来源（`{ channel: "web" | "api" }`）

### SkillResult — 执行结果

```typescript
export interface SkillResult {
  output: string;             // Skill 最终产出的文本（必填）
  toolsUsed?: string[];       // 执行过程中调用的工具名列表（可观测性）
  data?: Record<string, unknown>; // 自定义附加数据（结构化输出、中间态）
}
```

`output` 是 Skill 对用户的最终回复。`toolsUsed` 让调用方无需解析对话就能知道哪些工具被使用，用于日志、监控和计费。

### IAgentSkill — 所有 Skill 必须实现的接口

```typescript
export interface IAgentSkill extends SkillDefinition {
  execute(context: SkillContext, llm: LLMClient): Promise<SkillResult>;
}
```

`IAgentSkill` 继承 `SkillDefinition`（提供静态元数据：`name`、`description`、`triggerHint`、`tools` 等），并追加唯一必须实现的行为方法 `execute()`。

这个设计让 `MarkdownSkill`（无工具，轻量）和 `AgentSkill`（有工具，复杂逻辑）都能通过同一个接口被 `SkillRegistry` 管理。

---

## 4. AgentSkill — 可继承的 Skill 基类

### 设计意图

`AgentSkill` 提供两种使用方式：

**方式 A（直接实例化）** —— 无需写类，适合「有工具 + 有系统提示词」的简单场景：
```typescript
const skill = new AgentSkill({
  name: "weather",
  description: "获取城市实时天气",
  systemPrompt: "你是天气助理，只回答天气问题。",
  tools: [weatherApiTool],
});
```

**方式 B（继承扩展）** —— 需要完全自定义执行逻辑：
```typescript
class StockSkill extends AgentSkill {
  override async execute(ctx: SkillContext, llm: LLMClient): Promise<SkillResult> {
    const price = await fetchStockPrice(ctx.query);
    return { output: `当前股价：${price}` };
  }
}
```

### ToolRegistry 懒构建机制

```typescript
private _registry?: ToolRegistry;

protected get toolRegistry(): ToolRegistry {
  if (!this._registry) {
    this._registry = new ToolRegistry();
    for (const t of this.tools) {
      if (t instanceof Tool) {
        this._registry.registerTool(t);
      } else {
        this._registry.registerFunction(t.name, t.description, t.func, t.schema);
      }
    }
  }
  return this._registry;
}
```

`ToolRegistry` 在第一次调用 `toolRegistry` getter 时才构建（懒加载），避免在 Skill 注册阶段产生不必要的计算。构建后缓存在实例上，后续调用直接复用。

### 默认 execute() — 工具调用循环

默认实现分两条路径：

**路径 1：无工具（Plain LLM 调用）**
```
messages = [system, ...history, user]
    │
    ▼
llm.think(messages)
    │
    ▼
返回 { output }
```

**路径 2：有工具（Function-Calling 循环，最多 3 轮）**
```
messages = [system, ...history, user]
    │
    ▼
client.chat.completions.create({ tools: schemas, tool_choice: "auto" })
    │
    ├── toolCalls 为空 ──► 直接取 content 作为 finalOutput，退出循环
    │
    └── toolCalls 非空
            │
            ▼
        追加 assistant message（含 tool_calls）到 rawMessages
            │
            ▼
        逐个执行工具，追加 tool 结果到 rawMessages
            │
            ▼
        进入下一轮循环
    │
    ▼（循环结束 finalOutput 仍为空）
create({ tool_choice: "none" })  ← 强制 LLM 生成最终回复
    │
    ▼
返回 { output: finalOutput, toolsUsed }
```

**LLM Client 鸭子类型访问：**

```typescript
const client = (llm as unknown as Record<string, unknown>).client as { ... };
const model  = (llm as unknown as Record<string, unknown>).model as string;
```

由于 `@agenticforge/core` 的 `LLMClient` 接口只暴露 `think()` 方法，工具调用需要直接访问底层 `client`（OpenAI SDK 实例）和 `model`。使用鸭子类型而非强制 cast，保留了对非 OpenAI 实现的降级兼容——当 `client` 或 `model` 不存在时，自动回退到 `llm.think()` plain call。

---

## 5. SkillRegistry — 注册中心

### 内部结构

```typescript
private readonly skills = new Map<string, IAgentSkill>();
```

使用 `Map` 而非数组的原因：
- O(1) 按名称查找（`get`、`has`）
- 自然去重（同名 Skill 后注册覆盖前注册）
- 保持注册顺序（`Map` 迭代顺序 = 插入顺序）

### describeAll() — 路由 Prompt 生成

```typescript
describeAll(): string {
  const visibleSkills = this.visible();
  if (visibleSkills.length === 0) return "（暂无可用 Skill）";
  return visibleSkills
    
    .map((s) =>
      s instanceof AgentSkill
        ? s.describe()
        : `- **${s.name}**: ${s.description}${s.triggerHint ? '\n  触发条件：' + s.triggerHint : ''}`,
    )
    .join('\n');
}
```

`describeAll()` 生成的列表被注入路由 Prompt，供 LLM 做意图分类。

**`visible()` 过滤：** `visible: false` 的 Skill 不出现在路由 Prompt 里，只能通过 `runSkill(name)` 直接调用，适合「内部 Skill」或「需要鉴权才能触发的 Skill」。

---

## 6. SkillRunner — 框架无关的调度器

### 与 SkillAgent 的区别

| | `SkillRunner` | `SkillAgent`（agents 包）|
|---|---|---|
| 依赖 | 仅 `@agenticforge/skills` | 继承 `Agent` 基类 |
| 对话历史 | 调用方手动传入 | Agent 基类自动维护 |
| 适用场景 | 脚本、API 服务 | 完整 Agent 生命周期 |

### 路由三级匹配降级

```
LLM 返回 raw 字符串
    │
    ▼
registry.get(raw)              ← 精确匹配
    │ 失败
    ▼
visible.find(s => s.name.startsWith(raw))  ← 前缀匹配
    │ 失败
    ▼
visible.find(s => raw.includes(s.name))    ← 包含匹配
```

保证 LLM 返回大小写不一致、多了空格或标点时仍能命中。

### run() 执行流程

```
run(query, options?)
    ├── skillName 指定 → registry.get() → 找不到则 throw
    └── 无 skillName
            ▼
        routeToSkill(query)
            ├── undefined → fallback llm.think() → { output }
            └── IAgentSkill
                    ▼
                skill.execute(SkillContext, llm) → SkillResult
```

---

## 7. MarkdownSkill — Markdown 驱动的 Skill

### Frontmatter 解析

纯正则，无外部依赖，兼容 CRLF/LF：

```
源文本 → 正则匹配 --- 块
    ├── 无 frontmatter → 从 H1 推断 name/description
    └── 有 frontmatter
            ├── 逐行解析 key: value
            │   true/false → boolean，其余去引号
            └── body = frontmatter 后的全部内容（trim）
```

### 执行机制

正文作为 system prompt 注入，LLM "成为" Markdown 描述的角色：

```
[system: markdown 正文] + [...history] + [user: query] → llm.think() → output
```

**不支持工具调用**（`tools = [] as never[]`），需要工具时用 `AgentSkill`。

`fromFile()` 用动态 `import("node:fs/promises")` 避免 bundle 环境报错。

---

## 8. SkillLoader — 批量加载器

### 目录扫描

```
fromDirectory(dir) → resolve 为绝对路径 → walk()
    ├── readdir 失败 → 静默跳过
    ├── isDirectory && recursive → 递归
    └── isSkillFile(entry)?
            ├── 是 → MarkdownSkill.fromFile()，失败则 warn 继续
            └── 否 → 跳过
```

单文件失败不中断整批加载，适合混有非 Skill md 文件的目录（如 `.cursor/skills/`）。

**命名约定：** 只识别 `SKILL.md` 和 `*.skill.md`，其他 md 文件忽略。

---

## 9. 完整例子：从输入到输出

**场景：三技能助理，用户输入「东京今天下雨吗？」**

```
1. runner.run("东京今天下雨吗？")

2. routeToSkill() 构建路由 Prompt:
   可用 Skills:
   - **weather**: 获取城市实时天气（触发条件：询问天气/温度/降雨时）
   - **translator**: 翻译任意文本
   - **stock-query**: 查询实时股票价格
   用户输入: 东京今天下雨吗？
   → LLM 返回 "weather"

3. registry.get("weather") → MarkdownSkill（精确匹配）

4. SkillContext = { query: "东京今天下雨吗？" }

5. MarkdownSkill.execute():
   messages = [
     { role: "system", content: "你是简洁的天气助理..." },  ← md 正文
     { role: "user",   content: "东京今天下雨吗？" }
   ]
   → llm.think() → "东京今天（3/18）有小雨，气温约12°C"

6. 返回 { output: "东京今天（3/18）有小雨，气温约12°C" }
```

---

## 10. 可靠性与降级策略

| 失败点 | 降级策略 |
|--------|----------|
| 路由 LLM 返回无法匹配的名称 | 三级匹配后走 fallback LLM |
| LLM Client 不支持工具调用 | 检测 client/model 不存在时回退 llm.think() |
| 工具执行失败 | catch 后 result = "Error: ..."，继续循环 |
| 工具调用循环超 3 轮 | 强制 tool_choice: "none" 生成最终回复 |
| Skill 文件加载失败 | warn + 跳过，不中断批量加载 |
| 目录不存在 | readdir 异常静默跳过，返回空数组 |
| 无 Skill 注册 | fallback 到通用 LLM（fallbackPrompt） |

---

## 11. 局限与演进建议

### 当前限制

1. **路由精度依赖 LLM**：Skill 描述相似时可能路由错误，无 embedding 语义相似度兜底。
2. **Markdown Skill 无工具支持**：需要工具调用必须用 AgentSkill，两种 Skill 能力不对等。
3. **工具调用循环固定上限 3 次**：复杂任务可能不足，简单任务有浪费。
4. **无 Skill 版本管理**：同名 Skill 后注册直接覆盖，无冲突提示。
5. **Frontmatter 只支持简单 key-value**：不支持嵌套、列表等复杂 YAML 结构。

### 可落地的下一步

| 方向 | 实现思路 |
|------|----------|
| 向量语义路由 | 用 embedding 计算 query 与 Skill description 的余弦相似度，作为 LLM 路由的兜底 |
| MarkdownSkill 工具支持 | frontmatter 里声明 toolNames，SkillLoader 注入已注册工具 |
| 动态路由上限 | SkillRunner 构造参数增加 maxToolIterations |
| Skill 热重载 | SkillLoader 用 fs.watch 监听目录变化，自动更新 Registry |
| Skill 测试框架 | 提供 MockLLMClient + runSkillTest() 辅助函数，对 Skill 做单测 |
