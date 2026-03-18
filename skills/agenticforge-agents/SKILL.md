---
name: agenticforge-agents
description: Expert at selecting and configuring AgenticFORGE agents. Generates correct FunctionCallAgent, ReActAgent, PlanSolveAgent, ReflectionAgent, SimpleAgent, and SkillAgent code with proper configuration. Use when the user wants to build an agent, choose between agent types, configure agent options, or understand agent behavior.
triggerHint: When the user asks which agent to use, how to configure an agent, or wants to build any kind of agent with AgenticFORGE.
---

# AgenticFORGE Agents Expert

## Role
You are an expert in the `@agenticforge/agents` package. You select the right agent for the task, configure it correctly, and explain the tradeoffs. You always produce runnable code.

## Agent Selection — Non-Negotiable Rules

| Scenario | Agent | Why |
|---|---|---|
| Simple Q&A, chat, summarization | `SimpleAgent` | 1 LLM call, lowest cost |
| Call external APIs / tools | `FunctionCallAgent` | OpenAI function-calling protocol |
| Complex multi-step reasoning | `ReActAgent` | Thinks before each action |
| Long task needing full plan upfront | `PlanSolveAgent` | Plan → Execute (2x LLM cost) |
| High-quality writing / review | `ReflectionAgent` | Generate → Critique → Refine |
| Multiple business capabilities | `SkillAgent` | LLM-based intent routing |

**When in doubt: start with `FunctionCallAgent`. It handles 80% of use cases.**

## Complete Usage Patterns

### SimpleAgent — multi-turn chat
```typescript
import "dotenv/config";
import { SimpleAgent, LLMClient } from "@agenticforge/kit";

const agent = new SimpleAgent({
  llm: new LLMClient({ provider: "openai", model: "gpt-4o" }),
  systemPrompt: "You are a concise technical writer. Answer in 2-3 sentences.",
});

// History is automatically tracked between calls
const r1 = await agent.run("What is RAG?");
const r2 = await agent.run("Give me a code example."); // knows context from r1
agent.clearHistory(); // reset when session ends
```

### FunctionCallAgent — tool-driven tasks
```typescript
import "dotenv/config";
import { FunctionCallAgent, LLMClient } from "@agenticforge/kit";
import { Tool, toolAction } from "@agenticforge/tools";
import { z } from "zod";

const calcTool = new Tool({
  name: "calculator",
  description: "Evaluate a math expression. Returns the numeric result as string.",
  parameters: [{ name: "expr", type: "string", required: true }],
  action: toolAction(
    z.object({ expr: z.string() }),
    async ({ expr }) => String(eval(expr)) // use a safe math library in production
  ),
});

const agent = new FunctionCallAgent({
  llm: new LLMClient({ provider: "openai", model: "gpt-4o" }),
  tools: [calcTool],
  maxIterations: 10,   // max tool-call rounds before giving up
  systemPrompt: "You are a helpful math assistant.",
});

const result = await agent.run("What is (123 + 456) * 789?");
console.log(result);
```

### ReActAgent — step-by-step reasoning
```typescript
import { ReActAgent, LLMClient } from "@agenticforge/kit";

const agent = new ReActAgent({
  llm: new LLMClient({ provider: "openai", model: "gpt-4o" }),
  tools: [searchTool, calculatorTool],
  maxIterations: 15,
});

// ReAct outputs: Thought → Action → Observation → ... → Answer
const result = await agent.run(
  "What is the GDP of Japan divided by its population? Show your reasoning."
);
```

### PlanSolveAgent — plan-first execution
```typescript
import { PlanSolveAgent, LLMClient } from "@agenticforge/kit";

const agent = new PlanSolveAgent({
  llm: new LLMClient({ provider: "openai", model: "gpt-4o" }),
  tools: [searchTool, noteTool],
  // Note: makes 2 LLM calls per run — plan call + execute call
});

const result = await agent.run(
  "Research and write a 500-word report on the current state of AI regulation in the EU."
);
```

### ReflectionAgent — quality-first generation
```typescript
import { ReflectionAgent, LLMClient } from "@agenticforge/kit";

const agent = new ReflectionAgent({
  llm: new LLMClient({ provider: "openai", model: "gpt-4o" }),
  reflectionRounds: 2, // 1 generate + 2 critique-refine cycles
});

const result = await agent.run(
  "Write a compelling product description for an AI code editor."
);
```

### SkillAgent — multi-capability routing
```typescript
import { SkillAgent } from "@agenticforge/agents";
import { SkillLoader, AgentSkill } from "@agenticforge/skills";
import { LLMClient } from "@agenticforge/core";

const llm = new LLMClient({ provider: "openai", model: "gpt-4o" });

// Mix Markdown skills + TypeScript skills freely
const mdSkills = await SkillLoader.fromDirectory(".cursor/skills");
const tsSkills = [new StockSkill(), new EmailSkill()];

const agent = new SkillAgent({
  name: "my-assistant",
  llm,
  skills: [...mdSkills, ...tsSkills],
});

const reply = await agent.run("What is Apple's stock price?");
const result = await agent.runSkill("stock-query", "AAPL price?"); // bypass routing
```

## Configuration Reference

| Option | Agents | Default | Notes |
|---|---|---|---|
| `llm` | all | required | `LLMClient` instance |
| `systemPrompt` | all | none | Injected as first system message |
| `maxIterations` | FunctionCall, ReAct | 10 | Max tool-call loops |
| `reflectionRounds` | Reflection | 1 | How many critique cycles |
| `tools` | FunctionCall, ReAct, PlanSolve | [] | Tool instances |
| `skills` | SkillAgent | required | `IAgentSkill[]` |
| `name` | SkillAgent | required | Agent identifier |

## Gotchas

- `PlanSolveAgent` costs 
- `PlanSolveAgent` costs **2x tokens** per run — avoid for simple tasks
- `ReflectionAgent` with `reflectionRounds: 3` costs 4x tokens — use sparingly
- `SkillAgent.run()` auto-tracks history; `SkillRunner.run()` does NOT — pass `options.history` manually
- All agents expose `clearHistory()` — call it at session end to avoid context bleed
- `maxIterations` is a safety cap, not a target — well-designed tools finish in 2-3 iterations

## Output Format for Every Request

1. Recommend the right agent type with one-line justification
2. Complete runnable code with all imports and config
3. Call out cost/iteration tradeoffs if relevant
