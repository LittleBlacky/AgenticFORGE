# @agenticforge/workflow

[![npm](https://img.shields.io/npm/v/@agenticforge/workflow)](https://www.npmjs.com/package/@agenticforge/workflow)
[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)

<p><strong>中文</strong> | <a href="./README.md">English</a></p>

AgenticFORGE 的独立 DAG 工作流引擎。为 `WorkflowAgent` 提供底层驱动，也可以直接用于后端任务编排，无需 Agent 层包装。

## 安装

```bash
npm install @agenticforge/workflow
```

## 特性

- **Sequential**（顺序）— 通过 `depends` 形成线性执行链
- **Parallel**（并发）— 无相互依赖的节点在同一波次自动并发
- **Branch**（条件分支）— `condition(ctx)` 返回分支名，执行对应子 DAG
- **Loop**（循环）— do-while 模式，反复执行 `body` 子 DAG
- **拓扑排序** — Kahn 算法，自动检测循环依赖
- **并发上限** — `maxConcurrency` 控制单波次最大并发数

## 节点类型

| 类型 | 说明 |
|------|------|
| `tool` | 调用已注册工具，`inputTemplate` 支持 `{变量}` 插值 |
| `llm` | 直接调用 LLM，`promptTemplate` 支持 `{变量}` 插值 |
| `fn` | 自定义异步函数 `(ctx, llm, registry) => string` |
| `passthrough` | 透传某个 context 变量 |
| `branch` | 条件分支，`condition(ctx)` 返回分支名 |
| `loop` | 循环执行 `body` 子 DAG（do-while 语义） |

## 用法

### 直接使用（不经过 WorkflowAgent）

```ts
import "dotenv/config";
import { WorkflowEngine } from "@agenticforge/workflow";
import { LLMClient } from "@agenticforge/core";

const engine = new WorkflowEngine({
  llm: new LLMClient({ provider: "openai", model: "gpt-4o" }),
  verbose: true,
});

const result = await engine.execute(
  {
    name: "summary-pipeline",
    nodes: [
      { id: "draft",  type: "llm", promptTemplate: "写一段摘要：{input}",   depends: [] },
      { id: "refine", type: "llm", promptTemplate: "优化这段摘要：\n{draft}", depends: ["draft"] },
    ],
  },
  "2024年AI行业发展趋势",
);

console.log(result.output);
console.log(result.nodeResults); // 每个节点的状态和耗时
```

### 并发 fan-out / fan-in

```ts
const result = await engine.execute(
  {
    name: "bilingual-report",
    nodes: [
      { id: "fetch",     type: "tool", toolName: "search", inputTemplate: "{input}",                        depends: [] },
      { id: "analyze",   type: "llm",  promptTemplate: "分析：\n{fetch}",                                   depends: ["fetch"] },
      { id: "translate", type: "llm",  promptTemplate: "翻译成英文：\n{fetch}",                             depends: ["fetch"] },
      { id: "report",    type: "llm",  promptTemplate: "双语报告：\n{analyze}\n\n{translate}",               depends: ["analyze", "translate"] },
    ],
  },
  "2024年AI趋势",
);
```

### 条件分支

```ts
nodes: [
  { id: "classify", type: "llm", promptTemplate: "只输出 simple 或 complex：{input}", depends: [] },
  {
    id: "router", type: "branch",
    condition: (ctx) => ctx["classify"].includes("complex") ? "complex" : "simple",
    branches: {
      simple:  [{ id: "quick",  type: "llm", promptTemplate: "简洁回答：{input}",  depends: [] }],
      complex: [{ id: "detail", type: "llm", promptTemplate: "详细分析：{input}", depends: [] }],
    },
    depends: ["classify"],
  },
]
```

### 循环（迭代优化）

```ts
nodes: [
  {
    id: "refine", type: "loop",
    maxIterations: 3,
    condition: (ctx, iter) => !ctx["refine"].includes("满意"),
    body: [
      { id: "critique", type: "llm", promptTemplate: "批评上一版本：{refine}",   depends: [] },
      { id: "improve",  type: "llm", promptTemplate: "根据批评改进：{critique}", depends: ["critique"] },
    ],
  },
]
```

## WorkflowEngineOptions

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `llm` | `LLMClient` | 必填 | LLM 实例 |
| `registry` | `ToolRegistry` | — | `tool` 节点必须提供 |
| `verbose` | `boolean` | `false` | 打印每个波次的执行日志 |
| `maxConcurrency` | `number` | 不限制 | 单波次最大并发节点数 |

## 与 WorkflowAgent 配合使用

如需会话历史、Hooks 生命周期、`run()` 统一接口，可使用 `@agenticforge/agents` 中的 `WorkflowAgent`：

```ts
import { WorkflowAgent } from "@agenticforge/agents";
import type { WorkflowDefinition } from "@agenticforge/workflow";

const agent = new WorkflowAgent({
  name: "my-workflow",
  llm,
  verbose: true,
});

agent.setWorkflow(definition);
const output = await agent.run("输入文本");
```

## 链接

- [GitHub](https://github.com/LittleBlacky/AgenticFORGE/tree/main/packages/workflow)
- [npm](https://www.npmjs.com/package/@agenticforge/workflow)
- [主项目 README](https://github.com/LittleBlacky/AgenticFORGE)
