# Skills（技能系统）

Skills 系统让你将 Agent 的能力拆分为具名、自包含的单元。每个 Skill 只负责一个业务域 —— Agent 自动将请求路由到最合适的那个。

## 为什么需要 Skills？

传统 Agent 将所有能力写在单一 System Prompt 里。随着能力增长，Prompt 越来越长，越来越难维护，路由逻辑散落在 `if/else` 里。Skills 的解法：

- 每个能力有自己专属的系统提示词和工具集
- 非开发者可以通过编辑 Markdown 文件定义新 Skill
- 两级路由（规则路由 + LLM 路由）自动分发，无需手写分发逻辑

## 定义 Skill

### Markdown Skill（推荐）

创建 `SKILL.md`，frontmatter 定义路由元数据，正文成为系统提示词：

```markdown
---
name: code-reviewer
description: 审查 TypeScript 和 JavaScript 代码，发现 Bug、类型安全问题和性能隐患。
triggerHint: 当用户要求审查、检查或改善代码质量时
---

# 代码审查员

你是一位资深 TypeScript 工程师，正在进行严格的代码审查。

## 审查清单
- 类型安全：无隐式 `any`，返回值类型明确
- 错误处理：无未处理的 Promise rejection
- 性能：不必要的循环、内存泄漏

## 输出格式
1. **总体评价** — 一句话总结
2. **问题列表** — 严重程度 + 修复建议
3. **改进后的代码**
```

```ts
import { SkillLoader, SkillRunner } from "@agenticforge/skills";
import { LLMClient } from "@agenticforge/core";

const llm = new LLMClient({ provider: "openai", model: "gpt-4o" });
const skills = await SkillLoader.fromDirectory("./skills");
const runner = new SkillRunner({ llm, skills });

const result = await runner.run(
  "帮我审查：async function fetchUser(id) { return fetch('/api/' + id).then(r => r.json()); }"
);
console.log(result.output);
```

### TypeScript Skill

```ts
import { AgentSkill } from "@agenticforge/skills";
import type { SkillContext, SkillResult } from "@agenticforge/skills";
import type { LLMClient } from "@agenticforge/core";

class StockSkill extends AgentSkill {
  constructor() {
    super({
      name: "stock-query",
      description: "查询任意股票的实时价格和市场数据。",
      triggerHint: "当用户询问股票价格、市值、代码或交易数据时",
    });
  }

  override async execute(ctx: SkillContext, llm: LLMClient): Promise<SkillResult> {
    const price = await fetchStockPrice(extractTicker(ctx.query));
    const output = await llm.think([
      { role: "system", content: "用简洁友好的语言格式化股票数据。" },
      { role: "user",   content: `行情：${JSON.stringify(price)}\n问题：${ctx.query}` },
    ]);
    return { output };
  }
}
```

## 两级路由策略

`SkillRunner` 和 `SkillAgent` 使用两级策略，在速度和准确性之间取得平衡：

| 级别 | 工作方式 | LLM 调用次数 |
|------|---------|-------------|
| **规则路由**（优先） | 将 `triggerHint` 关键词与 query 匹配 | 0 |
| **LLM 路由**（兜底） | 把所有 Skill 描述发给 LLM 做意图分类 | 1 |

```ts
const runner = new SkillRunner({
  llm,
  skills: [...mdSkills, new StockSkill(), new CalendarSkill()],
  fallbackPrompt: "你是一个通用助理。",
});

await runner.run("明天柏林天气如何？");         // => 天气 Skill（规则路由命中）
await runner.run("帮我审查一下这段 TS 代码。");  // => code-reviewer Skill
await runner.run("特斯拉现在股价多少？");        // => StockSkill
await runner.run("帮我约一个周五下午三点的会。"); // => CalendarSkill

// 跳过路由，直接调用指定 Skill
await runner.runSkill("stock-query", "AAPL 和 MSFT 本周走势对比");
```

## 进阶：SkillDispatcher

如果你需要路由能力但不想用完整的 `SkillRunner`，可以直接使用 `SkillDispatcher`：

```ts
import { SkillDispatcher, SkillRegistry } from "@agenticforge/skills";

const registry = new SkillRegistry();
registry.register(weatherSkill);
registry.register(stockSkill);

const dispatcher = new SkillDispatcher(registry, llm);
const skill = await dispatcher.dispatch("东京明天下雨吗？");
if (skill) {
  const result = await skill.execute({ query }, llm);
}
```

## 与 SkillAgent 配合使用

```ts
import { SkillAgent } from "@agenticforge/agents";
import { SkillLoader } from "@agenticforge/skills";

const skills = await SkillLoader.fromDirectory("./skills");
const agent = new SkillAgent({ name: "assistant", llm, skills });

// 对话历史自动维护
await agent.run("伦敦今天天气怎么样？");
await agent.run("那东京呢？");         // 知道上一轮在问天气
await agent.run("哪个城市更暖和？");   // 继续路由到天气 Skill

agent.clearHistory();
```

## SkillRunner vs SkillAgent

| | `SkillRunner` | `SkillAgent` |
|---|---|---|
| 包 | `@agenticforge/skills` | `@agenticforge/agents` |
| 对话历史 | 手动传入（`options.history`）| 自动维护 |
| 继承 Agent 基类 | 否 | 是 |
| 适用场景 | 脚本、API 服务 | 完整 Agent 工作流 |

## Skill 文件命名

`SkillLoader` 识别：
- `SKILL.md` —— 推荐
- `*.skill.md`

其他 `.md` 文件（`README.md`、`examples.md`）会被忽略。
