# @agenticforge/core

[![npm](https://img.shields.io/npm/v/@agenticforge/core)](https://www.npmjs.com/package/@agenticforge/core)

AgenticFORGE 的基础层 —— LLM 客户端抽象、Agent 基类、消息模型、工具调用内核，以及 Hook 生命周期系统。

## 安装

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
  { role: "system", content: "你是简洁的助理。" },
  { role: "user",   content: "法国首都是哪里？" },
]);

for await (const chunk of llm.streamThink(messages)) {
  process.stdout.write(chunk);
}
```

## 工具调用：从 FunctionCallAgent 开始

让 Agent 调用工具的正确方式是定义 `Tool` 子类，注册到 `FunctionCallAgent`。Agent 会读取每个工具的 `description`，在合适的时机自主决定调用哪个工具、传入什么参数。

```ts
import { FunctionCallAgent, LLMClient } from "@agenticforge/core";
import { Tool, type ToolParameter } from "@agenticforge/tools";

// description 是 LLM 判断「何时调用这个工具」的依据
class OrderStatusTool extends Tool {
  constructor() {
    super(
      "get_order_status",
      "查询订单的物流状态和预计到达时间。当用户询问订单是否发货、什么时候到达时调用。"
    );
  }
  getParameters(): ToolParameter[] {
    return [{ name: "orderId", type: "string", description: "订单号", required: true, default: null }];
  }
  async run(params: Record<string, unknown>): Promise<string> {
    return getOrderStatus(String(params.orderId));
  }
}

class RefundTool extends Tool {
  constructor() {
    super(
      "initiate_refund",
      "为指定订单发起退款申请。当用户明确要求退款时调用。"
    );
  }
  getParameters(): ToolParameter[] {
    return [{ name: "orderId", type: "string", description: "订单号", required: true, default: null }];
  }
  async run(params: Record<string, unknown>): Promise<string> {
    return initiateRefund(String(params.orderId));
  }
}

const agent = new FunctionCallAgent({
  llm: new LLMClient({ provider: "openai", model: "gpt-4o" }),
  tools: [new OrderStatusTool(), new RefundTool()],
  systemPrompt: "你是专业的客服助理。",
});

// Agent 自主决定：先查订单状态，再发起退款
const result = await agent.run("我的订单 #12345 一周前下单，还没收到，能退款吗？");
console.log(result);
```

### ToolCallExecutor（底层内核）

`ToolCallExecutor` 是 function calling 循环的底层实现，`FunctionCallAgent`、`SimpleAgent` 和 `AgentSkill` 都基于它运行。只有在实现自定义 Agent 类时才需要直接使用它：

```ts
import { ToolCallExecutor } from "@agenticforge/core";

const executor = new ToolCallExecutor({ llm, maxIterations: 10 });
const result = await executor.run({
  messages,
  tools: registry.getOpenAISchemas(),
  executor: (name, args) => registry.execute(name, args),
});
```

| 情况 | 行为 |
|------|------|
| `tools` 为空 | 直接调用 `llm.think()`，不进入循环 |
| 工具执行抛错 | 捕获异常，以 `"Error: ..."` 字符串返回给 LLM |
| 达到 `maxIterations` | 强制发出 `tool_choice: "none"` 合成调用 |
| 使用 `stream()` | 工具循环非流式；最终回答逐 token 流式输出 |

## Agent 基类

```ts
import { Agent, Message } from "@agenticforge/core";

class MyAgent extends Agent {
  async run(inputText: string): Promise<string> {
    const messages = [
      { role: "system" as const, content: "你是海盗风格助理。" },
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

## Hook 生命周期

```ts
import { createConsoleLoggingHook, MetricsHook } from "@agenticforge/core";

const metrics = new MetricsHook();
agent
  .useHook(createConsoleLoggingHook({ events: ["afterRun", "onError"] }))
  .useHook(metrics.hook);

await agent.run("总结今日热点新闻。");
console.log(metrics.getSnapshot()); // { totalRuns, errors, ... }
```

Hook 事件顺序：`beforeRun` → `beforeLLMCall` → `afterLLMCall` → `beforeToolCall` → `afterToolCall` → `afterRun`（或 `onError`）。

## 主要导出

| 导出 | 说明 |
|------|------|
| `LLMClient` | OpenAI 兼容 LLM 客户端 |
| `Agent` | 所有 Agent 的抽象基类 |
| `Message` | 消息模型（system / user / assistant / tool）|
| `Config` | Agent 通用配置 |
| `ToolCallExecutor` | function calling 循环底层内核（自定义 Agent 使用）|
| `createConsoleLoggingHook` | 内置结构化日志 Hook |
| `MetricsHook` | 内置运行指标统计 Hook |

详细文档参见 [Core 包 README](https://github.com/LittleBlacky/AgenticFORGE/tree/main/packages/core)。
