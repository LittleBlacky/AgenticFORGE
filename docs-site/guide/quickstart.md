# Quick Start

Get a working agent in under 60 seconds.

## 1. Install

```bash
npm install @agenticforge/kit
# or
pnpm add @agenticforge/kit
```

> You also need `zod` for tool parameter validation:
> ```bash
> npm install zod
> ```

## 2. Set your API key

```bash
export OPENAI_API_KEY=sk-...
```

or create a `.env` file:

```
OPENAI_API_KEY=sk-...
```

## 3. Create your first agent

```ts
import {FunctionCallAgent, LLMClient, Tool, toolAction} from "@agenticforge/kit";
import {z} from "zod";

// 1. Define a tool
const weatherTool = new Tool({
  name: "get_weather",
  description: "Get the current weather for a city",
  parameters: [
    {name: "city", type: "string", description: "City name", required: true},
  ],
  action: toolAction(z.object({city: z.string()}), async ({city}) => {
    // Replace with a real weather API call
    return `${city}: sunny, 25°C`;
  }),
});

// 2. Create an LLM client
const llm = new LLMClient({
  provider: "openai",
  model: "gpt-4o",
  apiKey: process.env.OPENAI_API_KEY,
});

// 3. Create and run the agent
const agent = new FunctionCallAgent({llm, tools: [weatherTool]});
const result = await agent.run("What is the weather like in Tokyo and London?");
console.log(result);
```

## 4. Add memory

```ts
import {MemoryManager} from "@agenticforge/memory/manager";

const memory = new MemoryManager({
  enableWorking: true,
  enableSemantic: true,
});

await memory.addMemory({
  content: "User prefers responses in bullet points",
  memoryType: "semantic",
  importance: 0.9,
});

const context = await memory.retrieveMemories({
  query: "user preferences",
  limit: 3,
});
```

## What's next?

- [Agents Guide](/guide/agents) — understand when to use each agent type
- [Memory Guide](/guide/memory) — persistent memory and vector storage
- [RAG Pipeline](/guide/rag) — document indexing and semantic Q&A
- [Built-in Tools](/packages/tools-builtin) — search, notes, RAG tool, terminal
