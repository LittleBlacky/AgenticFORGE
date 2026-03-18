# @agenticforge/agents

[![npm](https://img.shields.io/npm/v/@agenticforge/agents)](https://www.npmjs.com/package/@agenticforge/agents)
[![license](https://img.shields.io/github/license/LittleBlacky/AgenticFORGE)](https://github.com/LittleBlacky/AgenticFORGE/blob/main/LICENSE)

<p><strong>中文</strong> | <a href="./README.md">English</a></p>

AgenticFORGE Agent 实现包，内置 ReAct、Plan-and-Solve、Reflection、FunctionCall、Simple 五种经典 Agent 工作流。

## 安装

```bash
npm install @agenticforge/agents
```

## 内置 Agent

| Agent | 适用场景 |
|-------|----------|
| `SimpleAgent` | 简单对话 Agent，支持多轮上下文 |
| `FunctionCallAgent` | 工具调用驱动，适合任务型场景 |
| `ReActAgent` | 推理-行动-观察循环，适合复杂推理 |
| `PlanSolveAgent` | 先规划后逐步执行，适合多步骤任务 |
| `ReflectionAgent` | 带自我反思与批评机制，适合高质量生成 |
| `SkillAgent` | 自动路由到最合适的 Skill，适合多能力切换场景 |

## SkillAgent

`SkillAgent` 将用户请求自动路由到最合适的 Skill。Skill 可以是 Markdown 文件或 TypeScript 类，详见 [@agenticforge/skills](https://www.npmjs.com/package/@agenticforge/skills)。

```ts
import { SkillAgent } from "@agenticforge/agents";
import { SkillLoader } from "@agenticforge/skills";

const mdSkills = await SkillLoader.fromDirectory(".cursor/skills");

const agent = new SkillAgent({
  name: "assistant",
  llm,
  skills: [...mdSkills, new StockSkill()],
});

// 自动路由到最合适的 Skill
const reply = await agent.run("东京今天下雨吗？");

// 直接调用指定 Skill
const result = await agent.runSkill("stock-query", "苹果股票现在多少？");
console.log(result.output);
```

## 使用示例

```ts
import {FunctionCallAgent, LLMClient} from "@agenticforge/agents";
import {Tool, toolAction} from "@agenticforge/tools";
import {z} from "zod";

const calcTool = new Tool({
  name: "calculator",
  description: "执行数学计算",
  parameters: [{name: "expr", type: "string", required: true}],
  action: toolAction(z.object({expr: z.string()}), async ({expr}) => String(eval(expr))),
});

const agent = new FunctionCallAgent({
  llm: new LLMClient({provider: "openai", model: "gpt-4o"}),
  tools: [calcTool],
});

const result = await agent.run("计算 (123 + 456) * 2");
console.log(result);
```

## 链接

- [GitHub](https://github.com/LittleBlacky/AgenticFORGE/tree/main/packages/agents)
- [npm](https://www.npmjs.com/package/@agenticforge/agents)
- [主项目 README](https://github.com/LittleBlacky/AgenticFORGE)
