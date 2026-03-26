# Agents

AgenticFORGE ships seven agent workflow implementations. Each wraps a different reasoning loop.

> Need runtime observability and lifecycle extension? See the [Hooks Guide](./hooks.md).

## Choosing the right agent

| Agent | Best For |
|-------|----------|
| `SimpleAgent` | Conversation without tool access — summarization, Q&A, writing |
| `FunctionCallAgent` | Needs to call APIs or tools reliably |
| `ReActAgent` | Complex multi-step reasoning, think before each action |
| `PlanSolveAgent` | Long tasks that benefit from an explicit plan upfront |
| `ReflectionAgent` | High-quality output that needs self-critique and refinement |
| `SkillAgent` | Multiple distinct capabilities — route each query to the right specialist |
| `WorkflowAgent` | Fixed automation pipelines with parallelizable steps |

---

## SimpleAgent

```ts
import { SimpleAgent, LLMClient } from "@agenticforge/kit";

const agent = new SimpleAgent({
  llm: new LLMClient({ provider: "openai", model: "gpt-4o" }),
  systemPrompt: "You are a friendly customer support agent. Keep answers concise.",
});

const r1 = await agent.run("I haven't received my order from last week.");
const r2 = await agent.run("The order number is #98234."); // history maintained
const r3 = await agent.run("Can I get a refund?");
agent.clearHistory();
```

---

## FunctionCallAgent

The most commonly used agent. Lets the LLM call tools via the OpenAI function-calling protocol, looping until a final answer is reached.

```ts
import { FunctionCallAgent, LLMClient } from "@agenticforge/kit";
import { Tool, type ToolParameter } from "@agenticforge/tools";

class FlightStatusTool extends Tool {
  constructor() { super("check_flight", "Check the live status of a flight by its flight number."); }
  getParameters(): ToolParameter[] {
    return [{ name: "flight_number", type: "string", description: "e.g. AA123", required: true, default: null }];
  }
  async run(params: Record<string, unknown>): Promise<string> {
    return `Flight ${params.flight_number}: On time, departs 14:30, gate B12`;
  }
}

const agent = new FunctionCallAgent({
  llm: new LLMClient({ provider: "openai", model: "gpt-4o" }),
  tools: [new FlightStatusTool()],
  systemPrompt: "You are a helpful travel assistant.",
  maxIterations: 10,
});

const result = await agent.run("Is my flight AA456 on time?");
// => "Your flight AA456 is on time! Departs at 14:30 from gate B12."
```

---

## ReActAgent

Implements the [ReAct](https://arxiv.org/abs/2210.03629) pattern: Thought → Action → Observation → repeat. Good for tasks where the solution path is not obvious upfront.

```ts
import { ReActAgent, LLMClient } from "@agenticforge/kit";

const agent = new ReActAgent({
  llm: new LLMClient({ provider: "openai", model: "gpt-4o" }),
  tools: [new WebSearchTool(), new CalculatorTool()],
  maxIterations: 15,
});

const result = await agent.run(
  "What was Vietnam's GDP growth rate in 2023, and how does it compare to the ASEAN average?"
);
```

---

## PlanSolveAgent

First creates a full plan, then executes each step. Reduces hallucination on complex multi-part tasks.

```ts
const agent = new PlanSolveAgent({
  llm: new LLMClient({ provider: "openai", model: "gpt-4o" }),
  tools: [new WebSearchTool()],
});

const result = await agent.run(
  "Research EU AI regulation in 2024 and write a 600-word summary."
);
```

> Makes **2 LLM calls per run** (plan + execute). Avoid for simple tasks.

---

## ReflectionAgent

Generates an answer, critiques it, then refines it. Best for writing tasks where quality matters more than speed.

```ts
const agent = new ReflectionAgent({
  llm: new LLMClient({ provider: "openai", model: "gpt-4o" }),
  reflectionRounds: 2,
  systemPrompt: "You are an expert product copywriter.",
});

const result = await agent.run(
  "Write a 3-sentence product description for a noise-cancelling AI earphone."
);
```

> `reflectionRounds: 2` costs **3x tokens**. Use sparingly.

---

## SkillAgent

Routes each query to the most appropriate Skill. Uses **keyword rule routing** (zero LLM cost) first, then **LLM intent routing** as fallback.

Ideal when you have distinct capabilities that should not interfere — billing, shipping, and technical support as separate skills.

```ts
import { SkillAgent } from "@agenticforge/kit";
import { SkillLoader } from "@agenticforge/skills";

const mdSkills = await SkillLoader.fromDirectory("./skills");

const agent = new SkillAgent({
  name: "ecommerce-support",
  llm,
  skills: [...mdSkills, new OrderLookupSkill()],
  fallbackPrompt: "You are a helpful e-commerce support agent.",
});

await agent.run("When will my order arrive?");         // => shipping skill
await agent.run("I was charged twice.");               // => billing skill
await agent.run("What's your return policy?");         // => return-policy skill
await agent.runSkill("order-lookup", "Track #99887"); // direct call
```

---

## withSkills — Add Skills to Any Agent

`withSkills` layers Skill routing onto **any** agent type. Skill routing runs first; if nothing matches, the original agent logic takes over unchanged.

```ts
import { ReActAgent, withSkills } from "@agenticforge/agents";

const ResearchWithSkills = withSkills(ReActAgent);

const agent = new ResearchWithSkills({
  name: "smart-researcher",
  llm,
  tools: [new WebSearchTool(), new CalculatorTool()],
  maxIterations: 12,
});

await agent.loadSkillsFromDir("./domain-skills");

await agent.run("What are your data retention policies?");       // => FAQ skill
await agent.run("Compare TSMC and Samsung revenue in Q3 2024."); // => ReAct loop
```

---

## WorkflowAgent

Executes a DAG of nodes. Nodes without mutual dependencies run concurrently.

| Mode | How it works |
|------|--------------|
| **Sequential** | `depends` forms a linear chain A → B → C |
| **Concurrent** | Nodes in the same wave with no dependencies run in parallel |
| **Branch** | `type: "branch"` + `condition(ctx)` selects a sub-DAG |
| **Loop** | `type: "loop"` + `condition(ctx, iter)` repeats the `body` sub-DAG |

### Concurrent fan-out / fan-in

```ts
import { WorkflowAgent, LLMClient } from "@agenticforge/kit";
import type { WorkflowDefinition } from "@agenticforge/workflow";

const agent = new WorkflowAgent({
  name: "report",
  llm: new LLMClient({ provider: "openai", model: "gpt-4o" }),
  verbose: true,
});

const workflow: WorkflowDefinition = {
  name: "bilingual-report",
  nodes: [
    { id: "fetch",     type: "tool", toolName: "search", inputTemplate: "{input}",                        depends: [] },
    { id: "analyze",   type: "llm",  promptTemplate: "Analyze:\n{fetch}",                                 depends: ["fetch"] },
    { id: "translate", type: "llm",  promptTemplate: "Translate to Chinese:\n{fetch}",                    depends: ["fetch"] },
    { id: "report",    type: "llm",  promptTemplate: "Bilingual report:\n{analyze}\n\n{translate}",        depends: ["analyze", "translate"] },
  ],
};

// analyze and translate run concurrently after fetch
const result = await agent.runWorkflow(workflow, "State of AI in 2024");
console.log(result.output);
console.log(result.nodeResults); // per-node timing and status
```

### Conditional branch

```ts
const workflow: WorkflowDefinition = {
  name: "smart-answer",
  nodes: [
    {
      id: "classify",
      type: "llm",
      promptTemplate: "Classify complexity, output only 'simple' or 'complex': {input}",
      depends: [],
    },
    {
      id: "router",
      type: "branch",
      condition: (ctx) => ctx["classify"].includes("complex") ? "complex" : "simple",
      branches: {
        simple:  [{ id: "quick",  type: "llm", promptTemplate: "Brief answer: {input}",    depends: [] }],
        complex: [{ id: "detail", type: "llm", promptTemplate: "Detailed analysis: {input}", depends: [] }],
      },
      depends: ["classify"],
    },
  ],
};
```

### Loop (iterative refinement)

```ts
const workflow: WorkflowDefinition = {
  name: "iterative-refine",
  nodes: [
    {
      id: "refine",
      type: "loop",
      maxIterations: 3,
      condition: (ctx) => !ctx["improve"]?.includes("satisfied"),
      body: [
        { id: "critique", type: "llm", promptTemplate: "Critique: {refine}",          depends: [] },
        { id: "improve",  type: "llm", promptTemplate: "Improve based on: {critique}", depends: ["critique"] },
      ],
    },
  ],
};
```

### WorkflowAgent options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `llm` | `LLMClient` | required | LLM instance |
| `registry` | `ToolRegistry` | — | Required for `tool` nodes |
| `verbose` | `boolean` | `false` | Log execution waves |
| `maxConcurrency` | `number` | unlimited | Max concurrent nodes per wave |

> For using `WorkflowEngine` directly without an agent wrapper, see [@agenticforge/workflow](/packages/workflow).

## Using built-in tools

```ts
import { FunctionCallAgent, LLMClient } from "@agenticforge/kit";
import { SearchTool, MemoryTool, NoteTool } from "@agenticforge/tools-builtin";

const agent = new FunctionCallAgent({
  llm: new LLMClient({ provider: "openai", model: "gpt-4o" }),
  tools: [
    new SearchTool({ backend: "tavily" }),
    new MemoryTool(),
    new NoteTool({ workspace: "./notes" }),
  ],
});

const result = await agent.run(
  "Search for recent AI news, save key findings to memory, and write a summary note."
);
```
