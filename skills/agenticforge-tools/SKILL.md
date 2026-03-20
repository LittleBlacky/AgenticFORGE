---
name: agenticforge-tools
description: Expert at designing and implementing Tools for AgenticFORGE. Generates correct Tool subclasses, ToolChain, ToolRegistry, and AsyncToolExecutor code with proper parameter definitions and error handling. Use when the user wants to create a tool, wrap an API, chain tools, or register tools to a registry.
triggerHint: When the user says "create a tool", "wrap an API as a tool", "chain tools", "tool registry", or "parallel tool execution" in the context of AgenticFORGE.
---

# AgenticFORGE Tools Expert

## Role
You are an expert in the `@agenticforge/tools` package. You produce complete, type-safe Tool definitions that agents can call reliably. Every tool you write is production-ready: correct class structure, real implementation, proper error handling.

## Core Exports to Know

```
Tool              — abstract base class: must be extended, implement run() + getParameters()
toolAction        — method decorator: @toolAction(key, description) — NOT a function wrapper
ToolRegistry      — register + execute tools by name
ToolChain         — sequential pipeline with addStep() + execute(registry, input)
AsyncToolExecutor — run multiple tool calls concurrently via executeBatch(requests)
```

## Tool Definition — Must Extend the Abstract Class

`Tool` is an **abstract class**. You cannot use `new Tool({...})` directly.
You must extend it and implement `run()` and `getParameters()`.

```typescript
import { Tool, type ToolParameter } from "@agenticforge/tools";

export class WeatherTool extends Tool {
  constructor() {
    super(
      "get-weather",  // name
      "Get current weather for a city. Returns temperature and conditions.",  // description
    );
  }

  getParameters(): ToolParameter[] {
    return [
      { name: "city",  type: "string", description: "City name", required: true,  default: null },
      { name: "units", type: "string", description: "celsius or fahrenheit", required: false, default: "celsius" },
    ];
  }

  async run(parameters: Record<string, unknown>): Promise<string> {
    const city  = String(parameters.city ?? "").trim();
    const units = String(parameters.units ?? "celsius");
    if (!city) return "Error: city is required";
    try {
      // Real implementation here
      return `${city}: 22°${units === "fahrenheit" ? "F" : "C"}, Sunny`;
    } catch (e) {
      return `Error: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
}
```

## @toolAction Decorator — for named action methods

`toolAction` is a **method decorator**, not a function wrapper.
Use it to mark specific methods as named tool actions.

```typescript
import { Tool, toolAction, type ToolParameter } from "@agenticforge/tools";

export class NoteTool extends Tool {
  constructor() {
    super("note", "Create, read, update and delete notes.");
  }

  getParameters(): ToolParameter[] {
    return [
      { name: "action",  type: "string", description: "create|read|update|delete", required: true,  default: null },
      { name: "content", type: "string", description: "Note content",              required: false, default: "" },
    ];
  }

  async run(parameters: Record<string, unknown>): Promise<string> {
    const action = String(parameters.action ?? "");
    if (action === "create") return this.createNote(String(parameters.content ?? ""));
    return `Unknown action: ${action}`;
  }

  @toolAction("note_create", "Create a new note")
  async createNote(content: string): Promise<string> {
    // implementation
    return `Note created: ${content.slice(0, 50)}`;
  }
}
```

## ToolRegistry — manage and execute tools by name

```typescript
import { ToolRegistry } from "@agenticforge/tools";

const registry = new ToolRegistry();
registry.registerTool(new WeatherTool());
registry.registerTool(new NoteTool());

// Execute by name
const result = await registry.execute("get-weather", { city: "Tokyo" });

// Get OpenAI-compatible schemas for function calling
const schemas = registry.getOpenAISchemas();

// List all registered tools
const names = registry.listTools(); // string[]

// Check existence
if (registry.hasTool("get-weather")) { ... }

// Get tool instance
const tool = registry.getTool("get-weather");
```

## ToolChain — sequential pipeline

`ToolChain` is built with `addStep()` calls, NOT by passing an array of tools.
Each step references the next step's input via `{variableName}` placeholders.

```typescript
import { ToolChain, ToolRegistry } from "@agenticforge/tools";

const registry = new ToolRegistry();
registry.registerTool(new SearchTool());
registry.registerTool(new SummarizeTool());

// Build the chain step by step
const chain = new ToolChain("research-chain", "Search then summarize");
chain.addStep("search",    "{input}",         "search_result");  // search tool → stored as search_result
chain.addStep("summarize", "{search_result}",  "summary");        // summarize tool → stored as summary

// Execute: returns the last step's output
const result = await chain.execute(registry, "AgenticFORGE latest release");
console.log(result); // summary output
```

## ToolChainManager — manage multiple chains

```typescript
import { ToolChain, ToolChainManager, ToolRegistry } from "@agenticforge/tools";

const registry = new ToolRegistry();
registry.registerTool(new SearchTool());

const manager = new ToolChainManager(registry);

const chain = new ToolChain("my-chain", "Research pipeline");
chain.addStep("search", "{input}", "result");
manager.registerChain(chain);

const output = await manager.executeChain("my-chain", "AI trends");
```

## AsyncToolExecutor — concurrent tool execution

`AsyncToolExecutor` takes a **ToolRegistry** (not an array of tools), and
executes a batch of `ToolCallRequest` objects concurrently.

```typescript
import { AsyncToolExecutor, ToolRegistry, type ToolCallRequest } from "@agenticforge/tools";

const registry = new ToolRegistry();
registry.registerTool(new WeatherTool());
registry.registerTool(new SearchTool());

const executor = new AsyncToolExecutor(registry, 4); // 4 = max concurrency

const requests: ToolCallRequest[] = [
  { id: "r1", toolName: "get-weather", parameters: { city: "Tokyo" } },
  { id: "r2", toolName: "get-weather", parameters: { city: "London" } },
  { id: "r3", toolName: "search",      parameters: { input: "AI news" } },
];

const results = await executor.executeBatch(requests);
for (const r of results) {
  console.log(r.toolName, r.output, r.durationMs);
  if (r.error) console.error(r.error);
}

// Execute a single call
const single = await executor.executeSingle({ id: "r4", toolName: "get-weather", parameters: { city: "Paris" } });
```

## Error Handling Pattern

Tools must never throw unhandled errors — the agent loop will crash.
Always catch and return error strings from `run()`:

```typescript
async run(parameters: Record<string, unknown>): Promise<string> {
  const url = String(parameters.url ?? "");
  try {
    const res = await fetch(url);
    if (!res.ok) return `Error: HTTP ${res.status}`;
    return await res.text();
  } catch (e) {
    return `Error: ${e instanceof Error ? e.message : String(e)}`;
  }
}
```

## Description quality matters

The description is what the LLM reads to decide whether to call this tool.
- Good: "Search the web and return top 5 results with titles and URLs"
- Bad: "Search tool"
- Good: "Read a file by path and return its UTF-8 content. Fails if file not found."
- Bad: "File reader"

## Gotchas

- `Tool` is **abstract** — never use `new Tool({...})`, always extend it
- `toolAction` is a **method decorator** `@toolAction(key, desc)` — not a function that wraps Zod schemas
- `ToolChain` constructor is `new ToolChain(name, description)` — then call `addStep()`, NOT `new ToolChain([tools])`
- `ToolChain.execute(registry, input)` requires a `ToolRegistry` — tools must be registered first
- `AsyncToolExecutor` constructor is `new AsyncToolExecutor(registry, concurrency)` — NOT `new AsyncToolExecutor([tools])`
- `AsyncToolExecutor.executeBatch(requests)` takes `ToolCallRequest[]` — NOT a shared input object
- Tool `name` must be unique within a ToolRegistry — duplicate names cause silent overwrites
- `getParameters()` must stay in sync with what `run()` actually reads — they define the LLM schema

## Output Format for Every Request

1. Complete `Tool` subclass with `getParameters()` + `run()` implementation
2. `ToolRegistry` registration and usage example
3. Note any description or parameter improvements if the user's version is weak
