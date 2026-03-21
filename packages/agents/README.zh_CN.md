# @agenticforge/agents

[![npm](https://img.shields.io/npm/v/@agenticforge/agents)](https://www.npmjs.com/package/@agenticforge/agents)
[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)


<p><strong>中文</strong> | <a href="./README.md">English</a></p>

AgenticFORGE Agent 实现包，内置 ReAct、Plan-and-Solve、Reflection、FunctionCall、Simple、SkillAgent、WorkflowAgent 七种 Agent 工作流。

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
| `WorkflowAgent` | DAG 工作流编排，支持并发节点执行 |

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

## WorkflowAgent

`WorkflowAgent` 按 DAG 拓扑顺序执行节点，无相互依赖的节点在同一波次内并发执行。每个节点的输出以 `nodeId` 为 key 写入共享 context，后续节点可通过 `{nodeId}` 插值引用。

支持节点类型：`tool` · `llm` · `fn` · `passthrough`

```ts
import { WorkflowAgent, LLMClient } from "@agenticforge/agents";
import type { WorkflowDefinition } from "@agenticforge/agents";

const agent = new WorkflowAgent({
  name: "report-workflow",
  llm: new LLMClient({ provider: "openai", model: "gpt-4o" }),
  verbose: true,
});

const definition: WorkflowDefinition = {
  name: "fan-out-report",
  nodes: [
    { id: "fetch",     type: "tool", toolName: "search", inputTemplate: "{input}",                          depends: [] },
    { id: "analyze",   type: "llm",  promptTemplate: "分析以下内容：\n{fetch}",                              depends: ["fetch"] },
    { id: "translate", type: "llm",  promptTemplate: "将以下内容翻译成英文：\n{fetch}",                      depends: ["fetch"] },
    { id: "report",    type: "llm",  promptTemplate: "综合分析与翻译写出双语简报：\n{analyze}\n{translate}",  depends: ["analyze", "translate"] },
  ],
};

// analyze 与 translate 在 fetch 完成后并发执行
const result = await agent.runWorkflow(definition, "2024年AI行业发展趋势");
console.log(result.output);
console.log(result.nodeResults); // 每个节点的耗时与状态
```

## 链接

- [GitHub](https://github.com/LittleBlacky/AgenticFORGE/tree/main/packages/agents)
- [npm](https://www.npmjs.com/package/@agenticforge/agents)
- [主项目 README](https://github.com/LittleBlacky/AgenticFORGE)
