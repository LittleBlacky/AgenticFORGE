# Agents

AgenticFORGE ships five agent workflow implementations. Each wraps a different reasoning loop.

## Choosing the right agent

| Agent | Reasoning Pattern | Best For |
|-------|------------------|----------|
| `SimpleAgent` | Single LLM call | Conversation, summarization |
| `FunctionCallAgent` | Tool call → result → repeat | Task automation, API orchestration |
| `ReActAgent` | Thought → Action → Observation loop | Complex multi-step reasoning |
| `PlanSolveAgent` | Plan all steps → execute each | Long-horizon tasks, research |
| `ReflectionAgent` | Generate → Critique → Refine | High-quality writing, code review |

## FunctionCallAgent

The most commonly used agent. It lets the LLM call tools via the OpenAI function-calling protocol.

```ts
import {FunctionCallAgent, LLMClient} from "@agenticforge/kit";
import {Tool, toolAction} from "@agenticforge/tools";
import {z} from "zod";

const searchTool = new Tool({
  name: "search",
  description: "Search the web for information",
  parameters: [{name: "query", type: "string", required: true}],
  action: toolAction(z.object({query: z.string()}), async ({query}) => {
    return `Results for: ${query}`;
  }),
});

const agent = new FunctionCallAgent({
  llm: new LLMClient({provider: "openai", model: "gpt-4o"}),
  tools: [searchTool],
  systemPrompt: "You are a helpful research assistant.", // optional
  maxIterations: 10, // optional, default: 10
});

const result = await agent.run("What are the latest developments in AI agents?");
console.log(result);
```

## ReActAgent

Implements the [ReAct](https://arxiv.org/abs/2210.03629) pattern: **Re**asoning + **Act**ing. The agent explicitly thinks before each action.

```ts
import {ReActAgent, LLMClient} from "@agenticforge/kit";

const agent = new ReActAgent({
  llm: new LLMClient({provider: "openai", model: "gpt-4o"}),
  tools: [/* your tools */],
  maxIterations: 15,
});

const result = await agent.run(
  "Research the top 3 vector databases and compare their performance."
);
```

## PlanSolveAgent

First creates a full plan, then executes each step. Good for tasks where upfront planning improves quality.

```ts
import {PlanSolveAgent, LLMClient} from "@agenticforge/kit";

const agent = new PlanSolveAgent({
  llm: new LLMClient({provider: "openai", model: "gpt-4o"}),
  tools: [/* your tools */],
});

const result = await agent.run(
  "Write a detailed report on the state of AI regulation in 2024."
);
```

## ReflectionAgent

Generates a response, then critiques and refines it. Useful for content quality tasks.

```ts
import {ReflectionAgent, LLMClient} from "@agenticforge/kit";

const agent = new ReflectionAgent({
  llm: new LLMClient({provider: "openai", model: "gpt-4o"}),
  reflectionRounds: 2, // how many critique-refine iterations
});

const result = await agent.run(
  "Write a concise, technical explanation of how transformers work."
);
```

## SimpleAgent

A thin wrapper around a single LLM call with optional conversation history.

```ts
import {SimpleAgent, LLMClient} from "@agenticforge/kit";

const agent = new SimpleAgent({
  llm: new LLMClient({provider: "openai", model: "gpt-4o"}),
  systemPrompt: "You are a concise technical writer.",
});

const result = await agent.run("Explain RAG in one paragraph.");
```

## Using built-in tools with agents

```ts
import {FunctionCallAgent, LLMClient} from "@agenticforge/kit";
import {SearchTool, MemoryTool, NoteTool} from "@agenticforge/tools-builtin";

const agent = new FunctionCallAgent({
  llm: new LLMClient({provider: "openai", model: "gpt-4o"}),
  tools: [
    new SearchTool({backend: "tavily"}),
    new MemoryTool(),
    new NoteTool({workspace: "./notes"}),
  ],
});

const result = await agent.run(
  "Search for recent AgenticFORGE news, save key findings to memory, and write a summary note."
);
```
