# @agenticforge/agents

[![npm](https://img.shields.io/npm/v/@agenticforge/agents)](https://www.npmjs.com/package/@agenticforge/agents)
[![license](https://img.shields.io/github/license/LittleBlacky/AgenticFORGE)](https://github.com/LittleBlacky/AgenticFORGE/blob/main/LICENSE)

<p><a href="./README.en.md">中文</a> | <strong>English</strong></p>

Classic agent workflow implementations for AgenticFORGE — ReAct, Plan-and-Solve, Reflection, FunctionCall, and Simple.

## Installation

```bash
npm install @agenticforge/agents
```

## Built-in Agents

| Agent | Best For |
|-------|----------|
| `SimpleAgent` | Single-turn or multi-turn conversation without tools |
| `FunctionCallAgent` | Tool-driven task execution |
| `ReActAgent` | Reasoning-action loops for complex reasoning tasks |
| `PlanSolveAgent` | Plan first, then execute step by step |
| `ReflectionAgent` | Self-critique loop for high-quality generation |

## Usage

```ts
import {FunctionCallAgent, LLMClient} from "@agenticforge/agents";
import {Tool, toolAction} from "@agenticforge/tools";
import {z} from "zod";

const calcTool = new Tool({
  name: "calculator",
  description: "Evaluate a math expression",
  parameters: [{name: "expr", type: "string", required: true}],
  action: toolAction(z.object({expr: z.string()}), async ({expr}) => String(eval(expr))),
});

const agent = new FunctionCallAgent({
  llm: new LLMClient({provider: "openai", model: "gpt-4o"}),
  tools: [calcTool],
});

const result = await agent.run("What is (123 + 456) * 2?");
console.log(result);
```

## Links

- [GitHub](https://github.com/LittleBlacky/AgenticFORGE/tree/main/packages/agents)
- [npm](https://www.npmjs.com/package/@agenticforge/agents)
- [Root README](https://github.com/LittleBlacky/AgenticFORGE)
