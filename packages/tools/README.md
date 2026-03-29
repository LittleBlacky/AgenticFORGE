# @agenticforge/tools

[![npm](https://img.shields.io/npm/v/@agenticforge/tools)](https://www.npmjs.com/package/@agenticforge/tools)
[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)

<p><a href="./README.zh_CN.md">中文</a> | <strong>English</strong></p>

Tool abstraction layer for AgenticFORGE — `Tool` base class, `ToolRegistry`, `ToolChain`, and async executor.

## Installation

```bash
npm install @agenticforge/tools
```

## Exports

| Name | Description |
|------|-------------|
| `Tool` | Abstract base class — extend it to define tools with typed parameters and execution logic |
| `defineFunctionTool` | Factory for creating lightweight function tools with optional Zod schema |
| `ToolRegistry` | Central registry for managing and executing tools |
| `ToolChain` | Sequential pipeline — compose multiple tools where each step feeds the next |
| `ToolChainManager` | Manages multiple named `ToolChain` instances |
| `AsyncToolExecutor` | Executes a batch of tool calls concurrently with bounded concurrency |

## Usage

### Extending `Tool` (recommended for complex tools)

```ts
import { Tool, ToolRegistry } from "@agenticforge/tools";
import type { ToolParameter } from "@agenticforge/tools";

class SearchTool extends Tool {
  constructor() {
    super("search", "Search the web for information");
  }

  getParameters(): ToolParameter[] {
    return [
      { name: "query", type: "string", description: "Search query", required: true, default: null },
      { name: "limit", type: "number", description: "Max results", required: false, default: 5 },
    ];
  }

  async run(params: Record<string, unknown>): Promise<string> {
    return `Search results for: ${params.query}`;
  }
}

const registry = new ToolRegistry();
registry.registerTool(new SearchTool());

const result = await registry.execute("search", { query: "AgenticFORGE" });
console.log(result);
```

### Custom Zod schema override (optional)

For precise validation beyond the auto-generated schema, override `zodSchema()`:

```ts
import { Tool, z } from "@agenticforge/tools";
import type { ToolParameter } from "@agenticforge/tools";

class FetchUrlTool extends Tool {
  constructor() {
    super("fetch-url", "Fetch content from a URL");
  }

  getParameters(): ToolParameter[] {
    return [
      { name: "url", type: "string", description: "Target URL", required: true, default: null },
    ];
  }

  // Override for stricter validation (e.g. URL format check)
  protected zodSchema() {
    return z.object({
      url: z.string().url("Must be a valid URL"),
    });
  }

  async run(params: Record<string, unknown>): Promise<string> {
    const res = await fetch(String(params.url));
    return await res.text();
  }
}
```

### Using `defineFunctionTool` (lightweight function tools)

```ts
import { defineFunctionTool, ToolRegistry } from "@agenticforge/tools";
import { z } from "zod";

const echoTool = defineFunctionTool({
  name: "echo",
  description: "Echo the input back",
  schema: z.object({ message: z.string() }),
  func: ({ message }) => message.toUpperCase(),
});

const registry = new ToolRegistry();
registry.registerFunction(echoTool.name, echoTool.description, echoTool.func, echoTool.schema);
```

### ToolChain — sequential pipelines

```ts
import { ToolChain, ToolRegistry } from "@agenticforge/tools";

const chain = new ToolChain("search-and-summarize", "Search then summarize");
chain.addStep("search",    "{input}",         "raw_results");
chain.addStep("summarize", "{raw_results}",   "summary");

const result = await chain.execute(registry, "AgenticFORGE latest news");
console.log(result); // value stored under "summary"
```

### AsyncToolExecutor — parallel batch execution

```ts
import { AsyncToolExecutor, ToolRegistry } from "@agenticforge/tools";

const executor = new AsyncToolExecutor(registry, 4); // max 4 concurrent
const results = await executor.executeBatch([
  { id: "r1", toolName: "search", parameters: { query: "AI news" } },
  { id: "r2", toolName: "search", parameters: { query: "frontend trends" } },
]);

for (const r of results) {
  console.log(r.id, r.output, r.durationMs);
}
```

## Parameter Validation

`Tool` subclasses get automatic parameter validation powered by Zod — no extra code needed:

| Behavior | Detail |
|---|---|
| Required field check | Returns `Error: <field>: Required` if a required param is missing |
| Type coercion | `number` / `boolean` params auto-coerce from strings (e.g. `"42"` → `42`) |
| Default filling | Optional params are filled with `default` value when omitted |
| Custom schema | Override `zodSchema()` for precise rules (`.url()`, `.email()`, `.min()`, etc.) |

When `ToolRegistry.execute()` is called, validation runs before `run()`. On failure, an `"Error: ..."` string is returned to the caller (LLM-friendly) rather than throwing.

## Links

- [GitHub](https://github.com/LittleBlacky/AgenticFORGE/tree/main/packages/tools)
- [npm](https://www.npmjs.com/package/@agenticforge/tools)
- [Root README](https://github.com/LittleBlacky/AgenticFORGE)
