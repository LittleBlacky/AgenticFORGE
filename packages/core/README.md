# @agenticforge/core

[![npm](https://img.shields.io/npm/v/@agenticforge/core)](https://www.npmjs.com/package/@agenticforge/core)
[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)

<p><a href="./README.zh_CN.md">中文</a> | <strong>English</strong></p>

The foundation layer of AgenticFORGE — LLM client abstraction, agent base class, message model, function-calling kernel, and the hook lifecycle system.

## Installation

```bash
npm install @agenticforge/core
```

---

## LLMClient

`LLMClient` is a thin wrapper around OpenAI-compatible APIs that normalizes the request/response shape.

```ts
import { LLMClient } from "@agenticforge/core";

const llm = new LLMClient({
  provider: "openai",
  model: "gpt-4o",
  apiKey: process.env.OPENAI_API_KEY,
});

const answer = await llm.think([
  { role: "system", content: "You are a concise assistant." },
  { role: "user",   content: "What is the capital of France?" },
]);
console.log(answer); // "Paris"

for await (const chunk of llm.streamThink(messages)) {
  process.stdout.write(chunk);
}
```

---

## Tool Calling: Start with FunctionCallAgent

The right way to give an agent tools is to define `Tool` subclasses and register them with `FunctionCallAgent`. The agent reads each tool's `description` to decide on its own when to call which tool and with what arguments.

```ts
import { FunctionCallAgent, LLMClient } from "@agenticforge/core";
import { Tool, type ToolParameter } from "@agenticforge/tools";

// The description tells the LLM *when* to use this tool
class OrderStatusTool extends Tool {
  constructor() {
    super(
      "get_order_status",
      "Look up the shipping status of an order. Call when the user asks whether an order has shipped or when it will arrive."
    );
  }
  getParameters(): ToolParameter[] {
    return [{ name: "orderId", type: "string", description: "The order ID", required: true, default: null }];
  }
  async run(params: Record<string, unknown>): Promise<string> {
    return getOrderStatus(String(params.orderId));
  }
}

class RefundTool extends Tool {
  constructor() {
    super(
      "initiate_refund",
      "Start a refund for a specific order. Call only when the user explicitly requests a refund."
    );
  }
  getParameters(): ToolParameter[] {
    return [{ name: "orderId", type: "string", description: "The order ID", required: true, default: null }];
  }
  async run(params: Record<string, unknown>): Promise<string> {
    return initiateRefund(String(params.orderId));
  }
}

const agent = new FunctionCallAgent({
  llm: new LLMClient({ provider: "openai", model: "gpt-4o" }),
  tools: [new OrderStatusTool(), new RefundTool()],
  systemPrompt: "You are a professional customer support agent.",
});

// The agent decides on its own: check order status first, then initiate refund
const result = await agent.run("I haven't received my order #12345. Can I get a refund?");
console.log(result);
```

### ToolCallExecutor (low-level kernel)

`ToolCallExecutor` is the function-calling loop that `FunctionCallAgent`, `SimpleAgent`, and `AgentSkill` run on internally.

If you are extending `Agent` to build a custom agent, call it inside `run()` to reuse the full loop while adding your own logic around it:

```ts
import { Agent, ToolCallExecutor } from "@agenticforge/core";
import { ToolRegistry } from "@agenticforge/tools";
import type { LLMClient } from "@agenticforge/core";
import type { Tool } from "@agenticforge/tools";

class AuditAgent extends Agent {
  private registry: ToolRegistry;

  constructor(params: { name: string; llm: LLMClient; tools: Tool[] }) {
    super(params);
    // ToolRegistry does two things:
    // 1. getOpenAISchemas() — converts Tool subclass parameter definitions to OpenAI function schemas
    // 2. execute(name, args)  — routes by tool name to the right Tool.run(), no if/else needed
    this.registry = new ToolRegistry(params.tools);
  }

  async run(inputText: string): Promise<string> {
    // Before: insert audit logging, permission checks, etc.
    console.log(`[audit] request: ${inputText}`);

    const executor = new ToolCallExecutor({ llm: this.llm, maxIterations: 8 });
    const result = await executor.run({
      messages: [
        { role: "system", content: "You are a professional data analyst." },
        // conversation history is carried automatically
        ...this.history.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user", content: inputText },
      ],
      tools: this.registry.getOpenAISchemas(),
      executor: (name, args) => this.registry.execute(name, args),
    });

    // After: record which tools were used
    console.log(`[audit] tools used: ${result.toolsUsed.join(", ") || "none"}`);
    return result.output;
  }
}

const agent = new AuditAgent({
  name: "audit-agent",
  llm,
  tools: [new DatabaseQueryTool(), new ChartGeneratorTool()],
});

const answer = await agent.run("Show last month's sales by region as a bar chart");
```

| Situation | What happens |
|-----------|-------------|
| `tools` is empty | Single `llm.think()` call, no loop |
| Tool throws an error | Caught and returned as `"Error: ..."` string to the LLM |
| Reaches `maxIterations` | Forces a `tool_choice: "none"` synthesis call |
| `stream()` used | Tool loop runs non-streaming; only the final answer streams token by token |

---

## Agent Base Class

All built-in agents extend `Agent`. If you want to implement a custom agent, extend it and implement `run()`:

```ts
import { Agent, Message } from "@agenticforge/core";

class MyAgent extends Agent {
  async run(inputText: string): Promise<string> {
    const messages = [
      { role: "system" as const, content: "You are a pirate." },
      ...this.history.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user" as const, content: inputText },
    ];
    const output = await this.llm.think(messages);
    this.addMessage(new Message({ role: "user",      content: inputText }));
    this.addMessage(new Message({ role: "assistant", content: output }));
    return output;
  }
}

const agent = new MyAgent({ name: "pirate", llm });
console.log(await agent.run("Say hello."));
console.log(await agent.run("Say it again.")); // conversation history included
agent.clearHistory();
```

---

## Hook Lifecycle

Hooks let you observe and intercept agent execution without modifying agent code — useful for logging, metrics, and cost tracking.

```ts
import { createConsoleLoggingHook, MetricsHook } from "@agenticforge/core";

const metrics = new MetricsHook();
agent
  .useHook(createConsoleLoggingHook({ events: ["afterRun", "onError"] }))
  .useHook(metrics.hook);

await agent.run("Summarize today's top news headlines.");

const snapshot = metrics.getSnapshot();
console.log(`Total runs: ${snapshot.totalRuns}, errors: ${snapshot.errors}`);
```

Hook event order: `beforeRun` → `beforeLLMCall` → `afterLLMCall` → `beforeToolCall` → `afterToolCall` → `afterRun` (or `onError`).

Set `strict: true` on a hook to make agent execution fail if the hook throws. Leave it `false` (default) for observability hooks.

---

## Exports

| Export | Description |
|--------|-------------|
| `LLMClient` | OpenAI-compatible LLM client |
| `Agent` | Abstract base class for all agents |
| `Message` | Message model (`system` / `user` / `assistant` / `tool`) |
| `Config` | Shared agent configuration |
| `ToolCallExecutor` | Function-calling loop kernel (for custom agent implementations) |
| `createConsoleLoggingHook` | Built-in structured logging hook |
| `MetricsHook` | Built-in run metrics collector |

---

## Links

- [GitHub](https://github.com/LittleBlacky/AgenticFORGE/tree/main/packages/core)
- [npm](https://www.npmjs.com/package/@agenticforge/core)
- [Root README](https://github.com/LittleBlacky/AgenticFORGE)
