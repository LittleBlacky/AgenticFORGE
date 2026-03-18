# Tools

Tools are the primary execution primitive in AgenticFORGE. Every action an agent takes goes through a tool.

## Defining a tool

```ts
import {Tool, toolAction} from "@agenticforge/tools";
import {z} from "zod";

const myTool = new Tool({
  name: "calculator",
  description: "Evaluate a math expression and return the result",
  parameters: [
    {
      name: "expression",
      type: "string",
      description: "A valid JavaScript math expression, e.g. '2 + 2 * 3'",
      required: true,
    },
  ],
  action: toolAction(
    z.object({expression: z.string()}),
    async ({expression}) => {
      try {
        return String(eval(expression));
      } catch {
        return "Invalid expression";
      }
    }
  ),
});
```

## ToolRegistry

Manages a collection of tools and provides lookup by name:

```ts
import {ToolRegistry} from "@agenticforge/tools";

const registry = new ToolRegistry();
registry.register(myTool);
registry.register(anotherTool);

const tool = registry.get("calculator");
const result = await tool.execute({expression: "(10 + 5) * 2"});
console.log(result); // "30"

// List all tool names
console.log(registry.list()); // ["calculator", "another-tool"]
```

## ToolChain

Chain multiple tools together — the output of one becomes the input of the next:

```ts
import {ToolChain} from "@agenticforge/tools";

const chain = new ToolChain([fetchTool, parseTool, summarizeTool]);
const result = await chain.run({url: "https://example.com/article"});
```

## AsyncToolExecutor

Run multiple tools concurrently with timeout and concurrency control:

```ts
import {AsyncToolExecutor} from "@agenticforge/tools";

const executor = new AsyncToolExecutor({
  concurrency: 3,
  timeoutMs: 10000,
});

const results = await executor.runAll([
  {tool: searchTool, params: {query: "AI agents"}},
  {tool: searchTool, params: {query: "vector databases"}},
  {tool: searchTool, params: {query: "LLM benchmarks"}},
]);
```

## Built-in tools

See the [@agenticforge/tools-builtin](/packages/tools-builtin) package for ready-to-use tools:

| Tool | Description |
|------|-------------|
| `SearchTool` | Web search (Tavily / SerpApi / DuckDuckGo / SearXNG / Perplexity) |
| `MemoryTool` | Read and write agent memory |
| `NoteTool` | Structured note management |
| `RagTool` | Document indexing and semantic Q\u0026A |
| `TerminalTool` | Safe terminal command execution |
