# Agent

AgenticFORGE 内置七种 Agent 工作流实现，每种封装不同的推理循环。

## 如何选择

| Agent | 推理模式 | 适用场景 |
|-------|---------|----------|
| `SimpleAgent` | 单次 LLM 调用 | 对话、摘要 |
| `FunctionCallAgent` | 工具调用循环 | 任务自动化、API 编排 |
| `ReActAgent` | 思考 → 行动 → 观察 | 复杂多步推理 |
| `PlanSolveAgent` | 规划全部步骤 → 逐步执行 | 长链路任务、研究 |
| `ReflectionAgent` | 生成 → 批评 → 改进 | 高质量内容生成 |
| `SkillAgent` | LLM 意图路由 | 多能力切换助手 |
| `WorkflowAgent` | DAG 节点执行，四种执行模式 | 企业自动化、数据流水线 |

## FunctionCallAgent

```ts
import {FunctionCallAgent, LLMClient, Tool, toolAction} from "@agenticforge/kit";
import {z} from "zod";

const searchTool = new Tool({
  name: "search",
  description: "搜索网络信息",
  parameters: [{name: "query", type: "string", required: true}],
  action: toolAction(z.object({query: z.string()}), async ({query}) => {
    return `${query} 的搜索结果...`;
  }),
});

const agent = new FunctionCallAgent({
  llm: new LLMClient({provider: "openai", model: "gpt-4o"}),
  tools: [searchTool],
  systemPrompt: "你是一个专业的研究助手。",
  maxIterations: 10,
});

const result = await agent.run("AI Agent 领域最新进展有哪些？");
console.log(result);
```

## ReActAgent

实现 [ReAct](https://arxiv.org/abs/2210.03629) 模式：推理 + 行动，Agent 在每次行动前显式思考。

```ts
import {ReActAgent, LLMClient} from "@agenticforge/kit";

const agent = new ReActAgent({
  llm: new LLMClient({provider: "openai", model: "gpt-4o"}),
  tools: [/* 你的工具 */],
  maxIterations: 15,
});

const result = await agent.run("调研前三名向量数据库并对比性能。");
```

## PlanSolveAgent

先制定完整计划，再逐步执行。适合需要前期规划的任务。

```ts
import {PlanSolveAgent, LLMClient} from "@agenticforge/kit";

const agent = new PlanSolveAgent({
  llm: new LLMClient({provider: "openai", model: "gpt-4o"}),
  tools: [/* 你的工具 */],
});

const result = await agent.run("撰写一份 2024 年 AI 监管现状的详细报告。");
```

## ReflectionAgent

生成内容后自我批评并改进，适合高质量写作、代码审查等场景。

```ts
import {ReflectionAgent, LLMClient} from "@agenticforge/kit";

const agent = new ReflectionAgent({
  llm: new LLMClient({provider: "openai", model: "gpt-4o"}),
  reflectionRounds: 2,
});

const result = await agent.run("写一篇简洁的 Transformer 技术博客。");
```

## SimpleAgent

```ts
import {SimpleAgent, LLMClient} from "@agenticforge/kit";

const agent = new SimpleAgent({
  llm: new LLMClient({provider: "openai", model: "gpt-4o"}),
  systemPrompt: "你是一位简洁的技术写作助手。",
});

const result = await agent.run("用一段话解释 RAG。");
```

## WorkflowAgent

`WorkflowAgent` 支持四种执行模式，通过声明式 DAG 节点定义，由 `WorkflowEngine` 自动调度：

| 模式 | 实现方式 |
|------|----------|
| **Sequential**（顺序） | 通过 `depends` 形成线性链 A → B → C |
| **Parallel**（并发） | 同一波次内无依赖关系的节点自动并发执行 |
| **Branch**（条件分支） | `type: "branch"` 节点，`condition` 返回分支名，执行对应子 DAG |
| **Loop**（循环） | `type: "loop"` 节点，反复执行 `body` 子 DAG（do-while 语义） |

### 节点类型

| 类型 | 说明 |
|------|------|
| `tool` | 调用已注册工具，`inputTemplate` 支持 `{变量}` 插值 |
| `llm` | 直接调用 LLM，`promptTemplate` 支持 `{变量}` 插值 |
| `fn` | 自定义异步函数，可访问完整 context |
| `passthrough` | 透传某个 context 变量 |
| `branch` | 条件分支，`condition(ctx)` 返回分支名 |
| `loop` | 循环执行，`body` 子 DAG 反复运行直到条件不满足 |

### 顺序 + 并发

```ts
import {WorkflowAgent, LLMClient} from "@agenticforge/kit";
import type {WorkflowDefinition} from "@agenticforge/agents";

const agent = new WorkflowAgent({
  name: "report",
  llm: new LLMClient({provider: "openai", model: "gpt-4o"}),
  registry, // ToolRegistry，type: "tool" 节点必须提供
  verbose: true,
});

const definition: WorkflowDefinition = {
  name: "bilingual-report",
  nodes: [
    {id: "fetch",     type: "tool", toolName: "search", inputTemplate: "{input}",           depends: []},
    // analyze 和 translate 并发执行（同依赖 fetch，互不依赖）
    {id: "analyze",   type: "llm",  promptTemplate: "分析：\n{fetch}",                      depends: ["fetch"]},
    {id: "translate", type: "llm",  promptTemplate: "翻译成英文：\n{fetch}",                depends: ["fetch"]},
    // report 等待两者完成后执行
    {id: "report",    type: "llm",  promptTemplate: "双语报告：\n{analyze}\n\n{translate}",  depends: ["analyze", "translate"]},
  ],
};

const result = await agent.runWorkflow(definition, "2024年AI行业趋势");
console.log(result.output);
console.log(result.nodeResults); // 每个节点的状态和耗时
```

### 条件分支（Branch）

```ts
const definition: WorkflowDefinition = {
  name: "smart-answer",
  nodes: [
    {
      id: "classify",
      type: "llm",
      promptTemplate: "判断问题复杂度，只输出 simple 或 complex：{input}",
      depends: [],
    },
    {
      id: "router",
      type: "branch",
      condition: (ctx) => ctx["classify"].includes("complex") ? "complex" : "simple",
      branches: {
        simple:  [{id: "quick",  type: "llm", promptTemplate: "简洁回答：{input}", depends: []}],
        complex: [{id: "detail", type: "llm", promptTemplate: "详细分析：{input}", depends: []}],
      },
      depends: ["classify"],
    },
  ],
};
```

### 循环（Loop）

```ts
const definition: WorkflowDefinition = {
  name: "iterative-refine",
  nodes: [
    {
      id: "refine",
      type: "loop",
      maxIterations: 3,
      // do-while：每轮结束后判断，返回 true 继续，false 停止
      condition: (ctx, iter) => !ctx["refine"].includes("满意"),
      body: [
        {id: "critique", type: "llm", promptTemplate: "批评上一版本：{refine}",   depends: []},
        {id: "improve",  type: "llm", promptTemplate: "根据批评改进：{critique}", depends: ["critique"]},
      ],
    },
  ],
};
// body 内通过 {refine} 引用上一次迭代输出，首次为空字符串
```

### 配置项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `llm` | `LLMClient` | 必填 | LLM 实例 |
| `registry` | `ToolRegistry` | — | `tool` 节点必须提供 |
| `verbose` | `boolean` | `false` | 打印每个波次的执行日志 |
| `maxConcurrency` | `number` | 不限制 | 单波次最大并发节点数 |
