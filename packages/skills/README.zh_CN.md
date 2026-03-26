# @agenticforge/skills

[![npm](https://img.shields.io/npm/v/@agenticforge/skills)](https://www.npmjs.com/package/@agenticforge/skills)
[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)


<p><strong>中文</strong> | <a href="./README.md">English</a></p>

AgenticFORGE 的可组合、可路由 Agent Skills 系统 —— 用 **Markdown 文件**或 **TypeScript 类**定义能力单元，让 Agent 自动路由到最合适的 Skill。

## 安装

```bash
npm install @agenticforge/skills
```

## 什么是 Skill？

**Skill** 是一个具名、自包含的 Agent 能力单元，类似于 Semantic Kernel 的 Plugin 或 Copilot Studio 的 Skill。每个 Skill 封装了：

- 明确的业务语义（`name` + `description`）
- 专属的系统提示词（角色定义、规则、约束）
- 专属的工具集（只有该 Skill 可使用）
- 独立的 `execute()` 执行逻辑

Skill 支持两种定义方式：

| 方式 | 适用场景 |
|------|----------|
| **Markdown 文件**（`.md`） | 非开发者、快速迭代、兼容 Cursor/Claude skills 目录规范 |
| **TypeScript 类** | 复杂逻辑、自定义工具编排、程序化控制 |

---

## Markdown Skill（推荐）

创建一个带 YAML frontmatter 的 `SKILL.md` 文件：

```markdown
---
name: weather-assistant
description: 获取城市实时天气，回答温度、降雨、风速相关问题
triggerHint: 当用户询问天气、温度、是否下雨、风速时
---

# 天气助理

## 角色
你是一个简洁的天气助理，只回答天气相关问题，用简洁中文回答。

## 规则
- 回答必须包含城市名和日期。
- 天气数据不可用时明确告知用户。
- 不回答与天气无关的问题。
```

从目录加载 Skills：

```ts
import { SkillLoader, SkillRunner } from "@agenticforge/skills";

const registry = await SkillLoader.registryFromDirectory(".cursor/skills");
const runner = new SkillRunner({ llm, skills: registry.all() });
const result = await runner.run("东京今天下雨吗？");
console.log(result.output);
```

---

## TypeScript Skill

### 方式 A — 直接实例化

```ts
import { AgentSkill, SkillRunner } from "@agenticforge/skills";

const weatherSkill = new AgentSkill({
  name: "weather",
  description: "获取城市实时天气，回答温度、降雨、风速问题",
  triggerHint: "当用户询问天气、温度、是否下雨时",
  systemPrompt: "你是简洁的天气助理，只回答天气相关问题，用中文回答。",
  tools: [weatherApiTool],
});

const runner = new SkillRunner({ llm, skills: [weatherSkill] });
const result = await runner.run("巴黎今天天气怎么样？");
```

### 方式 B — 继承扩展

```ts
import { AgentSkill } from "@agenticforge/skills";
import type { SkillContext, SkillResult } from "@agenticforge/skills";
import type { LLMClient } from "@agenticforge/core";

class StockSkill extends AgentSkill {
  constructor() {
    super({
      name: "stock-query",
      description: "查询实时股票价格和财务数据",
      triggerHint: "当用户询问股票价格、市值、财报时",
    });
  }

  override async execute(ctx: SkillContext, llm: LLMClient): Promise<SkillResult> {
    const price = await fetchStockPrice(ctx.query);
    return { output: `当前股价：${price}` };
  }
}
```

---

## 多 Skill 自动路由

```ts
import { SkillLoader, SkillRunner } from "@agenticforge/skills";

const mdSkills = await SkillLoader.fromDirectory(".cursor/skills");
const codeSkills = [new StockSkill(), new EmailSkill()];

const runner = new SkillRunner({ llm, skills: [...mdSkills, ...codeSkills] });

// 自动路由
await runner.run("苹果股票现在多少？");       // => StockSkill
await runner.run("东京今天下雨吗？");         // => weather SKILL.md
await runner.run("帮我起草一封会议邀请");     // => EmailSkill

// 直接调用指定 Skill（跳过路由）
await runner.runSkill("stock-query", "AAPL 股价");
```

---

## API 参考

### `MarkdownSkill`

| 方法 | 说明 |
|------|------|
| `MarkdownSkill.fromFile(path)` | 从 `.md` 文件加载 Skill |
| `MarkdownSkill.fromSource(text)` | 从原始 Markdown 字符串解析 Skill |
| `skill.execute(ctx, llm)` | 执行 Skill（将正文注入为 system prompt） |

### `AgentSkill`

| 属性 / 方法 | 说明 |
|-------------|------|
| `name` | Skill 唯一标识 |
| `description` | 一句话描述，用于路由匹配 |
| `triggerHint` | 描述触发条件，辅助 LLM 路由决策 |
| `systemPrompt` | Skill 执行时的系统提示词 |
| `tools` | 该 Skill 专属工具集 |
| `execute(ctx, llm)` | 默认：LLM + 工具调用循环。可 override 自定义逻辑 |

### `SkillRegistry`

| 方法 | 说明 |
|------|------|
| `register(skill)` | 注册一个 Skill |
| `get(name)` | 按名称查找 |
| `list()` | 所有已注册 Skill 名称 |
| `visible()` | 对 LLM 路由器可见的 Skills |
| `describeAll()` | 生成用于路由 prompt 的 Markdown 列表 |

### `SkillRunner`

| 方法 | 说明 |
|------|------|
| `run(query, options?)` | 自动路由并执行 |
| `runSkill(name, query)` | 直接执行指定 Skill |
| `addSkill(skill)` | 运行时动态注册 Skill |

### `SkillLoader`

| 方法 | 说明 |
|------|------|
| `fromDirectory(dir)` | 扫描目录，加载所有 `SKILL.md` |
| `fromFiles(paths[])` | 从指定路径列表加载 |
| `fromSources(sources[])` | 从原始字符串加载（测试/浏览器环境） |
| `toRegistry(skills[])` | 将 Skills 封装为 `SkillRegistry` |
| `registryFromDirectory(dir)` | `fromDirectory` + `toRegistry` 一步完成 |

---

## Skill 文件命名规范

`SkillLoader` 识别以下文件名：
- `SKILL.md`（推荐，兼容 Cursor / Claude skills 目录布局）
- `*.skill.md`

其他 `.md` 文件（如 `examples.md`、`README.md`）会被忽略。

---

## 与 SkillAgent 配合使用

如需完整的 Agent 体验（对话历史、`runStructured`），使用 `@agenticforge/agents` 中的 `SkillAgent`：

```ts
import { SkillAgent } from "@agenticforge/agents";
import { SkillLoader } from "@agenticforge/skills";

const skills = await SkillLoader.fromDirectory(".cursor/skills");

const agent = new SkillAgent({ name: "assistant", llm, skills });

const reply = await agent.run("东京今天下雨吗？");
const result = await agent.runSkill("weather", "明天东京天气如何？");
```

---

## 链接

- [GitHub](https://github.com/LittleBlacky/AgenticFORGE/tree/main/packages/skills)
- [npm](https://www.npmjs.com/package/@agenticforge/skills)
- [主项目 README](https://github.com/LittleBlacky/AgenticFORGE)
