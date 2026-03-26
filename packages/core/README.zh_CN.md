# @agenticforge/core

[![npm](https://img.shields.io/npm/v/@agenticforge/core)](https://www.npmjs.com/package/@agenticforge/core)
[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)

<p><strong>中文</strong> | <a href="./README.md">English</a></p>

AgenticFORGE 的基础层 —— LLM 客户端抽象、Agent 基类、消息模型、工具调用内核，以及 Hook 生命周期系统。

## 安装

```bash
npm install @agenticforge/core
```

---

## LLMClient

`LLMClient` 是对 OpenAI 兼容 API 的轻量封装，统一请求/响应格式。

```ts
import { LLMClient } from "@agenticforge/core";

const llm = new LLMClient({
  provider: "openai",
  model: "gpt-4o",
  apiKey: process.env.OPENAI_API_KEY,
});

// 单次调用
const answer = await llm.think([
  { role: "system", content: "你是一个简洁的助理。" },
  { role: "user",   content: "法国的首都是哪里？" },
]);
console.log(answer); // "巴黎"

// 流式输出
for await (const chunk of llm.streamThink(messages)) {
  process.stdout.write(chunk);
}
```

---

## 工具调用：从 FunctionCallAgent 开始

让 Agent 调用工具的正确方式是定义 `Tool` 子类，注册到 `FunctionCallAgent`。Agent 会自动读取每个工具的 `name` 和 `description`，在合适的时机决定调用哪个工具、传入什么参数。

```ts
import { FunctionCallAgent, LLMClient } from "@agenticforge/core";
import { Tool, type ToolParameter } from "@agenticforge/tools";

// description 是 LLM 判断「何时调用这个工具」的依据，写清楚触发条件
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

`ToolCallExecutor` 是 function calling 循环的底层实现，`FunctionCallAgent`、`SimpleAgent` 和 `AgentSkill` 都基于它运行。

如果你继承 `Agent` 实现自定义 Agent，在 `run()` 里调用它可以复用完整的循环逻辑，同时在调用前后插入自己的业务处理：

```ts
import { Agent, ToolCallExecutor } from "@agenticforge/core";
import { ToolRegistry } from "@agenticforge/tools";
import type { LLMClient } from "@agenticforge/core";
import type { Tool } from "@agenticforge/tools";

class AuditAgent extends Agent {
  private registry: ToolRegistry;

  constructor(params: { name: string; llm: LLMClient; tools: Tool[] }) {
    super(params);
    // ToolRegistry 负责两件事：
    // 1. getOpenAISchemas() — 把 Tool 子类的参数定义转换为 OpenAI function schema
    // 2. execute(name, args) — 根据工具名路由到对应 Tool.run()，无需手写 if/else
    this.registry = new ToolRegistry(params.tools);
  }

  async run(inputText: string): Promise<string> {
    // 调用前：插入审计日志
    console.log(`[audit] 收到请求：${inputText}`);

    const executor = new ToolCallExecutor({ llm: this.llm, maxIterations: 8 });
    const result = await executor.run({
      messages: [
        { role: "system", content: "你是专业的数据分析师。" },
        // 携带对话历史
        ...this.history.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user", content: inputText },
      ],
      tools: this.registry.getOpenAISchemas(),
      executor: (name, args) => this.registry.execute(name, args),
    });

    // 调用后：记录使用了哪些工具
    console.log(`[audit] 使用了工具：${result.toolsUsed.join(", ") || "无"}`);
    return result.output;
  }
}

const agent = new AuditAgent({
  name: "audit-agent",
  llm,
  tools: [new DatabaseQueryTool(), new ChartGeneratorTool()],
});

const answer = await agent.run("统计上个月各地区的销售额，生成柱状图");
```

| 情况 | 行为 |
|------|------|
| `tools` 为空数组 | 直接调用 `llm.think()`，不进入循环 |
| 工具执行抛错 | 捕获异常，以 `"Error: ..."` 字符串返回给 LLM |
| 达到 `maxIterations` | 强制发出 `tool_choice: "none"` 合成调用，得出最终回答 |
| 使用 `stream()` | 工具循环非流式；只有最终回答逐 token 流式输出 |

---

## Agent 基类

所有内置 Agent 都继承 `Agent`。如果你想实现自定义 Agent，继承它并实现 `run()` 方法：

```ts
import { Agent, Message } from "@agenticforge/core";

class MyAgent extends Agent {
  async run(inputText: string): Promise<string> {
    const messages = [
      { role: "system" as const, content: "你是一个海盗风格的助理。" },
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
console.log(await agent.run("说句问候语。"));
console.log(await agent.run("再说一遍。")); // 携带对话历史
agent.clearHistory();
```

---

## Hook 生命周期

Hook 让你在不修改 Agent 代码的情况下观察执行过程 —— 适用于日志、指标、成本追踪。

```ts
import { createConsoleLoggingHook, MetricsHook } from "@agenticforge/core";

const metrics = new MetricsHook();
agent
  .useHook(createConsoleLoggingHook({ events: ["afterRun", "onError"] }))
  .useHook(metrics.hook);

await agent.run("总结今天的热点新闻。");

const snapshot = metrics.getSnapshot();
console.log(`总运行次数: ${snapshot.totalRuns}，错误次数: ${snapshot.errors}`);
```

Hook 事件顺序：`beforeRun` → `beforeLLMCall` → `afterLLMCall` → `beforeToolCall` → `afterToolCall` → `afterRun`（或 `onError`）。

设置 `strict: true` 时，Hook 抛错会中断 Agent 执行。可观测 Hook 建议保持默认的 `strict: false`。

---

## 主要导出

| 导出 | 说明 |
|------|------|
| `LLMClient` | OpenAI 兼容 LLM 客户端 |
| `Agent` | 所有 Agent 的抽象基类 |
| `Message` | 消息模型（`system` / `user` / `assistant` / `tool`）|
| `Config` | Agent 通用配置 |
| `ToolCallExecutor` | function calling 循环底层内核（自定义 Agent 使用）|
| `createConsoleLoggingHook` | 内置结构化日志 Hook |
| `MetricsHook` | 内置运行指标统计 Hook |

---

## 链接

- [GitHub](https://github.com/LittleBlacky/AgenticFORGE/tree/main/packages/core)
- [npm](https://www.npmjs.com/package/@agenticforge/core)
- [主项目 README](https://github.com/LittleBlacky/AgenticFORGE)
