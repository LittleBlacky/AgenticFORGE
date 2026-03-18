# @agenticforge/agents

[![npm](https://img.shields.io/npm/v/@agenticforge/agents)](https://www.npmjs.com/package/@agenticforge/agents)
[![license](https://img.shields.io/github/license/LittleBlacky/AgenticFORGE)](https://github.com/LittleBlacky/AgenticFORGE/blob/main/LICENSE)

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

### FunctionCallAgent

```ts
import {FunctionCallAgent} from "@agenticforge/agents";
import {LLMClient} from "@agenticforge/core";
import {Tool, toolAction} from "@agenticforge/tools";
import {z} from "zod";

const llm = new LLMClient({provider: "openai", model: "gpt-4o"});

const calcTool = new Tool({
  name: "calculator",
  description: "Evaluate a math expression",
  parameters: [{name: "expr", type: "string", description: "Math expression", required: true}],
  action: toolAction(z.object({expr: z.string()}), async ({expr}) => {
    return String(eval(expr));
  }),
});

const agent = new FunctionCallAgent({llm, tools: [calcTool]});
const result = await agent.run("What is (123 + 456) * 2?");
console.log(result);
```

### ReActAgent

```ts
import {ReActAgent} from "@agenticforge/agents";
import {LLMClient} from "@agenticforge/core";

const agent = new ReActAgent({
  llm: new LLMClient({provider: "openai", model: "gpt-4o"}),
  tools: [/* your tools */],
  maxIterations: 10,
});

const result = await agent.run("Research the top 3 AI frameworks and summarize their differences.");
console.log(result);
```

### ReflectionAgent

```ts
import {ReflectionAgent} from "@agenticforge/agents";
import {LLMClient} from "@agenticforge/core";

const agent = new ReflectionAgent({
  llm: new LLMClient({provider: "openai", model: "gpt-4o"}),
  reflectionRounds: 2,
});

const result = await agent.run("Write a concise technical blog post about RAG.");
console.log(result);
```

## Links

- [GitHub](https://github.com/LittleBlacky/AgenticFORGE/tree/main/packages/agents)
- [npm](https://www.npmjs.com/package/@agenticforge/agents)
- [Root README](https://github.com/LittleBlacky/AgenticFORGE)
