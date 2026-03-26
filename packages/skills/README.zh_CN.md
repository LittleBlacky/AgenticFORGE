# @agenticforge/skills

[![npm](https://img.shields.io/npm/v/@agenticforge/skills)](https://www.npmjs.com/package/@agenticforge/skills)
[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)

<p><strong>中文</strong> | <a href="./README.md">English</a></p>

AgenticFORGE 的可组合、可路由 Agent 能力系统。将每种能力定义为一个聚焦的 **Skill** —— 用 Markdown 或 TypeScript —— 让框架自动把用户请求路由到最合适的那个。

## 安装

```bash
npm install @agenticforge/skills
```

---

## 什么是 Skill？

Skill 是一个具名、自包含的能力单元。把它想象成一个专家，你的 Agent 可以把具体问题委托给他：

- 一个**天气 Skill**，只处理天气相关问题
- 一个**代码审查 Skill**，专门评审 TypeScript 代码
- 一个**股票查询 Skill**，查询实时行情数据

每个 Skill 拥有自己的系统提示词、工具集和执行逻辑。用户请求到来时，框架自动路由到最匹配的 Skill。

---

## 定义 Skill

### 方式 1 — Markdown（大多数场景推荐）

创建一个 `SKILL.md` 文件。frontmatter 定义路由元数据，正文成为系统提示词。

```markdown
---
name: code-reviewer
description: 审查 TypeScript 和 JavaScript 代码，发现 Bug、类型安全问题和性能隐患。
triggerHint: 当用户要求审查、检查或改善代码质量时
---

# 代码审查员

你是一位资深 TypeScript 工程师，正在进行严格的代码审查。
优先关注正确性，其次是性能，最后是代码风格。

## 审查清单
- 类型安全：无隐式 `any`，返回值类型明确
- 错误处理：无未处理的 Promise rejection
- 边界条件：null/undefined、空数组

## 输出格式
1. **总体评价** — 一句话总结
2. **问题列表** — 每条包含严重程度和修复建议
3. **改进后的代码** — 重写有问题的部分
```

加载并运行：

```ts
import { SkillLoader, SkillRunner } from "@agenticforge/skills";

const skills = await SkillLoader.fromDirectory("./skills");
const runner = new SkillRunner({ llm, skills });

const result = await runner.run(
  "帮我审查这个函数：async function fetchUser(id) { return fetch('/api/' + id).then(r => r.json()); }"
);
console.log(result.output);
```

### 方式 2 — TypeScript 类

```ts
import { AgentSkill } from "@agenticforge/skills";
import type { SkillContext, SkillResult } from "@agenticforge/skills";
import type { LLMClient } from "@agenticforge/core";

class StockSkill extends AgentSkill {
  constructor() {
    super({
      name: "stock-query",
      description: "查询任意股票代码的实时价格和市场数据。",
      triggerHint: "当用户询问股票价格、市值、代码或交易数据时",
    });
  }

  override async execute(ctx: SkillContext, llm: LLMClient): Promise<SkillResult> {
    const price = await fetchStockPrice(extractTicker(ctx.query));
    const output = await llm.think([
      { role: "system", content: "用简洁友好的语言格式化股票数据。" },
      { role: "user",   content: `行情数据：${JSON.stringify(price)}\n问题：${ctx.query}` },
    ]);
    return { output };
  }
}
```

简单场景直接实例化，无需继承：

```ts
const translatorSkill = new AgentSkill({
  name: "translator",
  description: "在任意两种语言之间翻译文本。",
  triggerHint: "当用户想翻译文本，或问某个词在另一种语言中怎么说时",
  systemPrompt: "你是专业翻译。只输出翻译结果，不附加任何解释。",
});
```

---

## 多 Skill 自动路由

`SkillRunner`（和 `SkillAgent`）使用**两级路由策略**：

| 级别 | 工作方式 | LLM 调用次数 |
|------|---------|-------------|
| **规则路由**（优先） | 将 `triggerHint` 关键词与 query 匹配 | 0 |
| **LLM 路由**（兜底） | 把所有 Skill 描述发给 LLM 做意图分类 | 1 |

```ts
const runner = new SkillRunner({
  llm,
  skills: [...skills, new StockSkill(), new CalendarSkill()],
  fallbackPrompt: "你是一个通用助理。",
});

await runner.run("明天柏林天气如何？");         // => 天气 Skill（规则路由命中）
await runner.run("帮我审查一下这段 TS 代码。");  // => code-reviewer Skill
await runner.run("特斯拉现在股价多少？");        // => StockSkill
await runner.run("帮我约一个周五下午三点的会。"); // => CalendarSkill

// 跳过路由，直接调用指定 Skill
await runner.runSkill("stock-query", "AAPL 和 MSFT 本周走势对比");
```

---

## 进阶：SkillDispatcher

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

---

## API 参考

### `SkillRunner`

| 方法 | 说明 |
|------|------|
| `run(query, options?)` | 路由并执行最匹配的 Skill |
| `runSkill(name, query, options?)` | 直接执行指定 Skill（跳过路由）|
| `addSkill(skill)` | 运行时注册 Skill |
| `removeSkill(name)` | 注销 Skill |
| `listSkills()` | 列出所有已注册 Skill 名称 |

### `AgentSkill`

| 成员 | 说明 |
|------|------|
| `name` | 唯一标识 |
| `description` | 一句话描述，LLM 路由读取此字段 |
| `triggerHint` | 规则路由关键词（逗号分隔）|
| `systemPrompt` | 执行时注入的系统提示词 |
| `tools` | 该 Skill 专属工具集 |
| `execute(ctx, llm)` | Override 实现自定义执行逻辑 |

### `SkillLoader`

| 方法 | 说明 |
|------|------|
| `fromDirectory(dir)` | 递归扫描 `SKILL.md` 和 `*.skill.md` |
| `fromFiles(paths[])` | 从指定路径列表加载 |
| `fromSources(sources[])` | 从原始字符串解析 |
| `registryFromDirectory(dir)` | 一步完成扫描 + 封装为 `SkillRegistry` |

### `SkillRegistry`

| 方法 | 说明 |
|------|------|
| `register(skill)` | 注册 Skill |
| `get(name)` | 按名称查找 |
| `list()` | 所有已注册名称 |
| `visible()` | 对 LLM 路由器可见的 Skills |
| `describeAll()` | 生成路由 prompt 用的格式化列表 |

---

## 与 SkillAgent 配合使用

如需有状态的 Agent 体验（对话历史、多轮），使用 `@agenticforge/agents` 中的 `SkillAgent`：

```ts
import { SkillAgent } from "@agenticforge/agents";
import { SkillLoader } from "@agenticforge/skills";

const skills = await SkillLoader.fromDirectory("./skills");
const agent = new SkillAgent({ name: "assistant", llm, skills });

// 对话历史自动维护
await agent.run("伦敦今天天气怎么样？");
await agent.run("那东京呢？");       // 知道上一轮在问天气
await agent.run("哪个城市更暖和？"); // 继续路由到天气 Skill

agent.clearHistory(); // 会话结束时重置
```

---

## 链接

- [GitHub](https://github.com/LittleBlacky/AgenticFORGE/tree/main/packages/skills)
- [npm](https://www.npmjs.com/package/@agenticforge/skills)
- [主项目 README](https://github.com/LittleBlacky/AgenticFORGE)
