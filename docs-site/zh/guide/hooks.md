# Hooks 指南

AgenticFORGE Hooks 用于在**不改业务逻辑**的前提下，扩展和观测 Agent 运行时生命周期。

## 为什么需要 Hooks

适用场景：

- 对 `run` / `LLM` / `tool` 阶段做结构化日志
- 统计指标（耗时、次数、成功/失败）
- 审计追踪（`traceId` 串联链路）
- 在模型调用前后、工具调用前后注入策略

## 生命周期事件

| 事件 | 含义 |
|---|---|
| `beforeRun` | Agent 开始执行前 |
| `afterRun` | Agent 成功结束后 |
| `onError` | Agent 执行发生异常时 |
| `beforeLLMCall` | LLM 请求前 |
| `afterLLMCall` | LLM 响应后 |
| `beforeToolCall` | 工具调用前 |
| `afterToolCall` | 工具调用后 |

## 快速开始

```ts
import {SimpleAgent} from "@agenticforge/agents";
import {LLMClient, createConsoleLoggingHook, MetricsHook} from "@agenticforge/core";

const llm = new LLMClient({provider: "openai", model: "gpt-4o"});
const agent = new SimpleAgent({name: "assistant", llm});

const metrics = new MetricsHook();

agent
  .useHook(createConsoleLoggingHook({events: ["afterRun", "onError"]}))
  .useHook(metrics.hook);

const answer = await agent.run("请总结这份设计。");
console.log(answer);
console.log(metrics.getSnapshot());
```

## Hook 配置项

### 通用字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `name` | `string` | Hook 名称 |
| `priority` | `number` | 优先级（越大越先执行） |
| `strict` | `boolean` | `true` 时 Hook 报错会中断主流程 |
| `events` | `AgentHookEvent[]` | 仅订阅指定事件 |

### 上下文字段

`handle(context)` 可读取：

- `event`, `agentName`, `traceId`, `timestamp`
- 可选 `inputText`, `outputText`
- 可选 `llmRequest`, `llmResponse`
- 可选 `toolName`, `toolInput`, `toolOutput`
- 可选 `error`, `metadata`

## 自定义 Hook 示例

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

## 内置 Hook

### `createConsoleLoggingHook`

内置日志 Hook，支持事件过滤。

```ts
agent.useHook(createConsoleLoggingHook({events: ["afterRun", "onError"]}));
```

### `MetricsHook`

采集事件计数与 run/LLM/tool 的平均耗时。

```ts
const metrics = new MetricsHook();
agent.useHook(metrics.hook);

// 后续读取
const snapshot = metrics.getSnapshot();
```

## 最佳实践

- 生产环境观测 Hook 建议 `strict: false`。
- 用 `metadata` 挂业务标签（租户、场景、请求类型）。
- 日志落盘前注意对 prompt/tool 入参脱敏。
- 需要控制执行依赖时，用 `priority` 编排 Hook 顺序。

## 相关文档

- [Agent 指南](./agents.md)
- [Core 包文档](../packages/core.md)
