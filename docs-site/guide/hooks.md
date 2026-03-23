# Hooks Guide

AgenticFORGE Hooks let you observe and extend agent runtime lifecycle without changing agent business logic.

## Why use Hooks

Use hooks when you need:

- Structured logs for `run` / `LLM` / `tool` phases
- Metrics (latency, counts, success/failure)
- Auditing and trace correlation (`traceId`)
- Custom policies before/after model or tool calls

## Lifecycle events

| Event | Meaning |
|---|---|
| `beforeRun` | Fired before an agent run starts |
| `afterRun` | Fired after a run succeeds |
| `onError` | Fired when run fails |
| `beforeLLMCall` | Before an LLM request |
| `afterLLMCall` | After an LLM response |
| `beforeToolCall` | Before a tool invocation |
| `afterToolCall` | After a tool invocation |

## Quick start

```ts
import {SimpleAgent} from "@agenticforge/agents";
import {LLMClient, createConsoleLoggingHook, MetricsHook} from "@agenticforge/core";

const llm = new LLMClient({provider: "openai", model: "gpt-4o"});
const agent = new SimpleAgent({name: "assistant", llm});

const metrics = new MetricsHook();

agent
  .useHook(createConsoleLoggingHook({events: ["afterRun", "onError"]}))
  .useHook(metrics.hook);

const answer = await agent.run("Summarize this design.");
console.log(answer);
console.log(metrics.getSnapshot());
```

## Hook options

### Common fields

| Field | Type | Description |
|---|---|---|
| `name` | `string` | Hook identifier |
| `priority` | `number` | Higher value runs earlier |
| `strict` | `boolean` | If `true`, hook errors interrupt agent run |
| `events` | `AgentHookEvent[]` | Subscribe only selected events |

### Context fields

`handle(context)` receives:

- `event`, `agentName`, `traceId`, `timestamp`
- optional `inputText`, `outputText`
- optional `llmRequest`, `llmResponse`
- optional `toolName`, `toolInput`, `toolOutput`
- optional `error`, `metadata`

## Custom hook example

```ts
import type {AgentHook} from "@agenticforge/core";

const timingHook: AgentHook = {
  name: "timing-hook",
  events: ["beforeRun", "afterRun"],
  handle: (ctx) => {
    console.log(`[${ctx.event}] trace=${ctx.traceId} agent=${ctx.agentName}`);
  },
};

agent.useHook(timingHook);
```

## Built-in hooks

### `createConsoleLoggingHook`

Simple runtime logger with event filtering.

```ts
agent.useHook(createConsoleLoggingHook({events: ["afterRun", "onError"]}));
```

### `MetricsHook`

Collects event counts and average latency for run/LLM/tool phases.

```ts
const metrics = new MetricsHook();
agent.useHook(metrics.hook);

// later
const snapshot = metrics.getSnapshot();
```

## Best practices

- Keep observation hooks `strict: false` in production.
- Use `metadata` for domain tags (tenant, scenario, request type).
- Avoid putting sensitive raw prompt/tool payloads directly into persistent logs.
- Use `priority` when one hook depends on another hook’s output.

## Related docs

- [Agents Guide](./agents.md)
- [Core Package](../packages/core.md)
