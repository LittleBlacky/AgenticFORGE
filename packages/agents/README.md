# @agenticforge/agents

[![npm](https://img.shields.io/npm/v/@agenticforge/agents)](https://www.npmjs.com/package/@agenticforge/agents)
[![license](https://img.shields.io/github/license/LittleBlacky/AgenticFORGE)](https://github.com/LittleBlacky/AgenticFORGE/blob/main/LICENSE)

AgenticFORGE Agent 实现包，内置 ReAct、Plan-and-Solve、Reflection、FunctionCall、Simple 五种经典 Agent 工作流。

> Classic agent workflow implementations for AgenticFORGE.

## 安装

```bash
npm install @agenticforge/agents
```

## 内置 Agent

| Agent | 说明 |
|-------|------|
| `SimpleAgent` | 简单对话 Agent，支持多轮上下文 |
| `FunctionCallAgent` | 工具调用驱动，适合任务型场景 |
| `ReActAgent` | 推理-行动-观察循环，适合复杂推理 |
| `PlanSolveAgent` | 先规划后逐步执行，适合多步骤任务 |
| `ReflectionAgent` | 带自我反思与批评机制，适合高质量生成 |

## 使用示例

```ts
import {FunctionCallAgent} from "@agenticforge/agents";
import {LLMClient} from "@agenticforge/core";
import {Tool, toolAction} from "@agenticforge/tools";
import {z} from "zod";

const llm = new LLMClient({provider: "openai", model: "gpt-4o"});

const calcTool = new Tool({
  name: "calculator",
  description: "执行数学计算",
  parameters: [{name: "expr", type: "string", description: "数学表达式", required: true}],
  action: toolAction(z.object({expr: z.string()}), async ({expr}) => {
    return String(eval(expr));
  }),
});

const agent = new FunctionCallAgent({llm, tools: [calcTool]});
const result = await agent.run("计算 (123 + 456) * 2");
console.log(result);
```

## 链接

- [GitHub](https://github.com/LittleBlacky/AgenticFORGE/tree/main/packages/agents)
- [npm](https://www.npmjs.com/package/@agenticforge/agents)
- [主项目 README](https://github.com/LittleBlacky/AgenticFORGE)
