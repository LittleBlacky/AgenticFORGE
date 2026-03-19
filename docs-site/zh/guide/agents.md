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
| `WorkflowAgent` | DAG 节点执行 | 企业自动化、数据流水线 |

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
