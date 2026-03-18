# @agenticforge/tools

[![npm](https://img.shields.io/npm/v/@agenticforge/tools)](https://www.npmjs.com/package/@agenticforge/tools)
[![license](https://img.shields.io/github/license/LittleBlacky/AgenticFORGE)](https://github.com/LittleBlacky/AgenticFORGE/blob/main/LICENSE)

<p><a href="./README.en.md">中文</a> | <strong>English</strong></p>

Tool abstraction layer for AgenticFORGE — `Tool` base class, `ToolRegistry`, `ToolChain`, and async executor.

## Installation

```bash
npm install @agenticforge/tools
```

## Exports

| Name | Description |
|------|-------------|
| `Tool` | Tool base class — wraps parameter definitions and execution logic |
| `toolAction` | Tool action factory with Zod-based parameter validation |
| `ToolRegistry` | Registry for managing available tools |
| `ToolChain` | Tool chain — compose multiple tools in sequence or parallel |
| `AsyncToolExecutor` | Async tool executor with timeout and concurrency control |

## Usage

```ts
import {Tool, toolAction, ToolRegistry} from "@agenticforge/tools";
import {z} from "zod";

const searchTool = new Tool({
  name: "search",
  description: "Search the web for information",
  parameters: [
    {name: "query", type: "string", description: "Search query", required: true},
  ],
  action: toolAction(z.object({query: z.string()}), async ({query}) => {
    return `Search results for: ${query}`;
  }),
});

const registry = new ToolRegistry();
registry.register(searchTool);

const tool = registry.get("search");
const result = await tool.execute({query: "AgenticFORGE"});
console.log(result);
```

## Links

- [GitHub](https://github.com/LittleBlacky/AgenticFORGE/tree/main/packages/tools)
- [npm](https://www.npmjs.com/package/@agenticforge/tools)
- [Root README](https://github.com/LittleBlacky/AgenticFORGE)
