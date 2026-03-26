# @agenticforge/workflow

[![npm](https://img.shields.io/npm/v/@agenticforge/workflow)](https://www.npmjs.com/package/@agenticforge/workflow)

独立 DAG 工作流引擎。为 `WorkflowAgent` 提供底层驱动，也可直接使用，无需 Agent 层包装。

## 安装

```bash
npm install @agenticforge/workflow
```

## 包含内容

- `WorkflowEngine` — DAG 执行引擎，支持拓扑排序、并发波次、branch 和 loop
- 所有工作流类型：`WorkflowDefinition`、`WorkflowNode`、`WorkflowResult`、`NodeResult` 等

## 节点类型

| 类型 | 说明 |
|------|------|
| `tool` | 调用已注册工具，`inputTemplate` 支持 `{变量}` 插值 |
| `llm` | 直接调用 LLM，`promptTemplate` 支持 `{变量}` 插值 |
| `fn` | 自定义异步函数 `(ctx, llm, registry) => string` |
| `passthrough` | 透传某个 context 变量 |
| `branch` | 条件分支，`condition(ctx)` 返回分支名 |
| `loop` | 循环执行 `body` 子 DAG（do-while 语义） |

## 直接使用

```ts
import { WorkflowEngine } from "@agenticforge/workflow";
import { LLMClient } from "@agenticforge/core";

const engine = new WorkflowEngine({
  llm: new LLMClient({ provider: "openai", model: "gpt-4o" }),
  verbose: true,
  maxConcurrency: 4,
});

const result = await engine.execute(
  {
    name: "bilingual-report",
    nodes: [
      { id: "fetch",     type: "tool", toolName: "search", inputTemplate: "{input}",                       depends: [] },
      { id: "analyze",   type: "llm",  promptTemplate: "分析：\n{fetch}",                                  depends: ["fetch"] },
      { id: "translate", type: "llm",  promptTemplate: "翻译成英文：\n{fetch}",                            depends: ["fetch"] },
      { id: "report",    type: "llm",  promptTemplate: "双语报告：\n{analyze}\n\n{translate}",              depends: ["analyze", "translate"] },
    ],
  },
  "2026年AI趋势",
);

console.log(result.output);
console.log(result.nodeResults); // 每个节点的状态和耗时
```

## WorkflowEngineOptions

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `llm` | `LLMClient` | 必填 | LLM 实例 |
| `registry` | `ToolRegistry` | — | `tool` 节点必须提供 |
| `verbose` | `boolean` | `false` | 打印每个波次的执行日志 |
| `maxConcurrency` | `number` | 不限制 | 单波次最大并发节点数 |

## 与 WorkflowAgent 配合使用

如需会话历史和 Hooks 生命周期：

```ts
import { WorkflowAgent } from "@agenticforge/agents";
import type { WorkflowDefinition } from "@agenticforge/workflow";

const agent = new WorkflowAgent({ name: "my-workflow", llm, verbose: true });
agent.setWorkflow(definition);
const output = await agent.run("输入文本");
```

完整 WorkflowAgent 文档见 [Agent 指南](/zh/guide/agents#workflowagent)。
