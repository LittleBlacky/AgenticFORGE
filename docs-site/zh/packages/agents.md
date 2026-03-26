# @agenticforge/agents

[![npm](https://img.shields.io/npm/v/@agenticforge/agents)](https://www.npmjs.com/package/@agenticforge/agents)

经典 Agent 工作流实现 — ReAct、Plan-and-Solve、Reflection、FunctionCall、Simple、SkillAgent、WorkflowAgent。

## 安装

```bash
npm install @agenticforge/agents
```

## 内置 Agent

| Agent | 适用场景 |
|-------|----------|
| `SimpleAgent` | 单轮/多轮对话，无工具调用 |
| `FunctionCallAgent` | 工具调用驱动的任务执行 |
| `ReActAgent` | 推理-行动循环，复杂推理任务 |
| `PlanSolveAgent` | 先规划后执行，多步骤任务 |
| `ReflectionAgent` | 自我批评循环，高质量内容生成 |
| `SkillAgent` | LLM 意图路由，多能力切换 |
| `WorkflowAgent` | DAG 工作流编排，支持并发节点执行 |

详见 [Agent 指南](/zh/guide/agents)。
