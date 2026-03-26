# @agenticforge/agents

[![npm](https://img.shields.io/npm/v/@agenticforge/agents)](https://www.npmjs.com/package/@agenticforge/agents)

Classic agent workflow implementations — ReAct, Plan-and-Solve, Reflection, FunctionCall, Simple, SkillAgent, and WorkflowAgent.

## Installation

```bash
npm install @agenticforge/agents
```

## Available agents

| Agent | Pattern |
|-------|--------|
| `SimpleAgent` | Single LLM call |
| `FunctionCallAgent` | Tool call loop |
| `ReActAgent` | Thought → Action → Observation |
| `PlanSolveAgent` | Plan → Execute |
| `ReflectionAgent` | Generate → Critique → Refine |
| `SkillAgent` | LLM-based intent routing |
| `WorkflowAgent` | DAG-based concurrent node execution |

See the [Agents Guide](/guide/agents) for detailed usage and examples.
