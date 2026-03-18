# Skills（技能系统）

Skills 系统让你将 Agent 的能力拆分为具名、自包含的单元。每个 Skill 只负责一个业务域，Agent 自动将每条用户请求路由到最合适的 Skill。

## 为什么需要 Skills？

传统 Agent 将所有能力写在单一 System Prompt 里，随着能力增长，Prompt 越来越长，越来越难维护。Skills 的解法：

- 每个能力有自己专属的系统提示词和工具集
- 非开发者可以通过编辑 Markdown 文件定义新 Skill
- 自动意图路由，无需手写 `if/else` 分发逻辑

## 两种 Skill 定义方式

| 方式 | 适用场景 |
|------|----------|
| **Markdown 文件**（`SKILL.md`） | 快速迭代、非开发者可维护、兼容 Cursor/Claude skills 目录 |
| **TypeScript 类** | 复杂逻辑、自定义工具编排、程序化控制 |

## Markdown Skill

在项目中任意位置创建 `SKILL.md` 文件：

```markdown
---
name: weather
description: 获取城市实时天气，回答温度、降雨、风速问题
triggerHint: 当用户询问天气、温度、是否下雨、风速时
---

# 天气助理

你是简洁的天气助理，只回答天气相关问题，用中文回答。

## 规则
- 回答必须包含城市名和日期。
- 天气数据不可用时明确告知用户。
- 不回答与天气无关的问题。
```

加载并运行：

```ts
import { SkillLoader, SkillRunner } from "@agenticforge/skills";
import { LLMClient } from "@agenticforge/core";

const llm = new LLMClient({ provider: "openai", model: "gpt-4o" });

// 递归扫描目录，加载所有 SKILL.md
const registry = await SkillLoader.registryFromDirectory(".cursor/skills");

const runner = new SkillRunner({ llm, skills: registry.all() });
const result = await runner.run("东京今天下雨吗？");
console.log(result.output);
```

## TypeScript Skill

### 直接实例化

```ts
import { AgentSkill, SkillRunner } from "@agenticforge/skills";
import { LLMClient } from "@agenticforge/core";

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

### 继承扩展

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

## 自动意图路由

注册多个 Skill 后，`SkillRunner` 用 LLM 对用户意图分类，自动分发到最合适的 Skill：

```ts
import { SkillLoader, SkillRunner } from "@agenticforge/skills";

const mdSkills = await SkillLoader.fromDirectory(".cursor/skills");
const codeSkills = [new StockSkill(), new EmailSkill()];

const runner = new SkillRunner({ llm, skills: [...mdSkills, ...codeSkills] });

await runner.run("苹果股票现在多少？");       // => StockSkill
await runner.run("东京今天下雨吗？");         // => weather SKILL.md
await runner.run("帮我起草一封会议邀请");     // => EmailSkill

// 绕过路由，直接调用指定 Skill
await runner.runSkill("stock-query", "AAPL 股价");
```

## 与 SkillAgent 配合使用

`SkillAgent`（来自 `@agenticforge/agents`）继承 `Agent` 基类，提供对话历史管理和标准 `run()` / `streamRun()` 