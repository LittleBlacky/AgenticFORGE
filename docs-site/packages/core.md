# @agenticforge/core

[![npm](https://img.shields.io/npm/v/@agenticforge/core)](https://www.npmjs.com/package/@agenticforge/core)

The foundation layer of AgenticFORGE — LLM client abstraction, agent base class, message model, function-calling kernel, and the hook lifecycle system.

## Installation

```bash
npm install @agenticforge/core
```

## LLMClient

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

for await (const chunk of llm.streamThink(messages)) {
  process.stdout.write(chunk);
}
```

## Tool Calling: Start with FunctionCallAgent

The right way to give an agent tools is to define `Tool` subclasses and register them with `FunctionCallAgent`. The agent reads each tool's `description` and decides on its own when to call which tool.

```ts
import { FunctionCallAgent, LLMClient } from "@agenticforge/core";
import { Tool, type ToolParameter } from "@agenticforge/tools";

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

// The agent decides: check order status first, then initiate refund
const result = await agent.run("I haven't received my order #12345. Can I get a refund?");
console.log(result);
```

### ToolCallExecutor (low-level kernel)

The function-calling loop that `FunctionCallAgent`, `SimpleAgent`, and `AgentSkill` run on internally. Use it directly only when implementing a custom Agent class:

```ts
import { ToolCallExecutor } from "@agenticforge/core";

const executor = new ToolCallExecutor({ llm, maxIterations: 10 });
const result = await executor.run({
  messages,
  tools: registry.getOpenAISchemas(),
  executor: (name, args) => registry.execute(name, args),
});
```

| Situation | Behavior |
|-----------|----------|
| `tools` is empty | Single `llm.think()` call, no loop |
| Tool throws an error | Caught and returned as `"Error: ..."` string to the LLM |
| Reaches `maxIterations` | Forces a `tool_choice: "none"` synthesis call |
| `stream()` used | Tool loop runs non-streaming; final answer streams token by token |

## Agent Base Class

```ts
import { Agent, Message } from "@agenticforge/core";

class MyAgent extends Agent {
  async run(inputText: string): Promise<string> {
    const messages = [
      { role: "system" as const, content: "You are a pirate assistant." },
      ...this.history.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user" as const, content: inputText },
    ];
    const output = await this.llm.think(messages);
    this.addMessage(new Message({ role: "user",      content: inputText }));
    this.addMessage(new Message({ role: "assistant", content: output }));
    return output;
  }
}
```

## Hook Lifecycle

```ts
import { createConsoleLoggingHook, MetricsHook } from "@agenticforge/core";

const metrics = new MetricsHook();
agent
  .useHook(createConsoleLoggingHook({ events: ["afterRun", "onError"] }))
  .useHook(metrics.hook);

await agent.run("Summarize today's top news.");
console.log(metrics.getSnapshot()); // { totalRuns, errors, ... }
```

Hook event order: `beforeRun` → `beforeLLMCall` → `afterLLMCall` → `beforeToolCall` → `afterToolCall` → `afterRun` (or `onError`).

## Exports

| Export | Description |
|--------|-------------|
| `LLMClient` | OpenAI-compatible LLM client |
| `Agent` | Abstract base class for all agents |
| `Message` | Message model (system / user / assistant / tool) |
| `Config` | Shared agent configuration |
| `ToolCallExecutor` | Function-calling loop kernel (for custom agent implementations) |
| `createConsoleLoggingHook` | Built-in structured logging hook |
| `MetricsHook` | Built-in run metrics collector |

See the [Core package README](https://github.com/LittleBlacky/AgenticFORGE/tree/main/packages/core) for more details.
