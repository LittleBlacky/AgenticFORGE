# Agent

AgenticFORGE 内置七种 Agent 工作流实现，每种封装不同的推理循环。

> 如果你需要运行时可观测性和生命周期扩展能力，请阅读 [Hooks 指南](./hooks.md)。

## 如何选择

| Agent | 适用场景 |
|-------|----------|
| `SimpleAgent` | 无工具的对话 —— 摘要、问答、写作 |
| `FunctionCallAgent` | 需要可靠调用 API 或工具 |
| `ReActAgent` | 复杂多步推理，边思考边行动 |
| `PlanSolveAgent` | 长任务，先制定计划再逐步执行 |
| `ReflectionAgent` | 高质量输出，需要自我批评和迭代 |
| `SkillAgent` | 多种独立能力，自动路由到对应专家 Skill |
| `WorkflowAgent` | 固定流程自动化，步骤可并发执行 |

---

## SimpleAgent

```ts
import { SimpleAgent, LLMClient } from "@agenticforge/kit";

const agent = new SimpleAgent({
  llm: new LLMClient({ provider: "openai", model: "gpt-4o" }),
  systemPrompt: "你是一个友好的电商客服，回答简洁。",
});

const r1 = await agent.run("我上周的订单还没到。");
const r2 = await agent.run("订单号是 #98234。"); // 携带上一轮历史
const r3 = await agent.run("能退款吗？");
agent.clearHistory();
```

---

## FunctionCallAgent

通过 OpenAI function calling 协议让 LLM 调用工具，循环直至得出最终回答。

```ts
import { FunctionCallAgent, LLMClient } from "@agenticforge/kit";
import { Tool, type ToolParameter } from "@agenticforge/tools";

class FlightStatusTool extends Tool {
  constructor() { super("check_flight", "查询航班实时状态，输入航班号。"); }
  getParameters(): ToolParameter[] {
    return [{ name: "flight_number", type: "string", description: "航班号，如 CA123", required: true, default: null }];
  }
  async run(params: Record<string, unknown>): Promise<string> {
    return `航班 ${params.flight_number}：准点，14:30 起飞，B12 登机口`;
  }
}

const agent = new FunctionCallAgent({
  llm: new LLMClient({ provider: "openai", model: "gpt-4o" }),
  tools: [new FlightStatusTool()],
  systemPrompt: "你是专业的旅行助理。",
  maxIterations: 10,
});

const result = await agent.run("CA456 航班准点吗？");
// => "您的 CA456 航班准点！14:30 在 B12 登机口起飞。"
```

---

## ReActAgent

思考 → 行动 → 观察 → 循环。适合解法路径不明确的复杂任务。

```ts
import { ReActAgent, LLMClient } from "@agenticforge/kit";

const agent = new ReActAgent({
  llm: new LLMClient({ provider: "openai", model: "gpt-4o" }),
  tools: [new WebSearchTool(), new CalculatorTool()],
  maxIterations: 15,
});

const result = await agent.run("2023 年越南 GDP 增速是多少？与东盟平均水平相比如何？");
```

---

## PlanSolveAgent

先生成完整步骤计划，再逐步执行。适合长链路研究任务。

```ts
const agent = new PlanSolveAgent({
  llm: new LLMClient({ provider: "openai", model: "gpt-4o" }),
  tools: [new WebSearchTool()],
});

const result = await agent.run("调研 2024 年欧盟 AI 法规，写一份 600 字中文摘要。");
```

> 每次 `run()` 发出 **2 次 LLM 调用**（规划 + 执行）。简单任务请勿使用。

---

## ReflectionAgent

生成回答 → 批评 → 改进。适合输出质量比速度更重要的写作任务。

```ts
const agent = new ReflectionAgent({
  llm: new LLMClient({ provider: "openai", model: "gpt-4o" }),
  reflectionRounds: 2,
  systemPrompt: "你是专业的产品文案撰写者。",
});

const result = await agent.run("为降噪 AI 耳机写 3 句产品介绍。");
```

> `reflectionRounds: 2` 消耗 **3 倍 token**，请谨慎使用。

---

## SkillAgent

两级路由：**关键词规则路由**（零 LLM 开销）优先，**LLM 意图路由**兜底。

```ts
import { SkillAgent } from "@agenticforge/kit";
import { SkillLoader } from "@agenticforge/skills";

const mdSkills = await SkillLoader.fromDirectory("./skills");

const agent = new SkillAgent({
  name: "ecommerce-support",
  llm,
  skills: [...mdSkills, new OrderLookupSkill()],
  fallbackPrompt: "你是专业的电商客服。",
});

await agent.run("我的订单什么时候到？");       // => 物流 Skill
await agent.run("我被重复扣款了。");           // => 账单 Skill
await agent.run("退货政策是什么？");           // => 退货政策 Skill
await agent.runSkill("order-lookup", "追踪 #99887"); // 直接调用
```

---

## withSkills — 为任意 Agent 叠加 Skill 层

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

await agent.run("数据保留政策是什么？");              // => FAQ Skill 命中
await agent.run("对比台积电和三星 2024 Q3 营收。"); // => ReAct 循环
```

---

## WorkflowAgent

按 DAG 拓扑顺序执行，无依赖的节点自动并发。

| 模式 | 实现方式 |
|------|----------|
| **顺序** | `depends` 形成线性链 |
| **并发** | 同波次无依赖节点自动并发 |
| **条件分支** | `type: "branch"` + `condition(ctx)` |
| **循环** | `type: "loop"` + `condition(ctx, iter)` |

### 并发 fan-out / fan-in

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
    { id: "fetch",     type: "tool", toolName: "search", inputTemplate: "{input}",              depends: [] },
    { id: "analyze",   type: "llm",  promptTemplate: "分析：\n{fetch}",                        depends: ["fetch"] },
    { id: "translate", type: "llm",  promptTemplate: "翻译成英文：\n{fetch}",                  depends: ["fetch"] },
    { id: "report",    type: "llm",  promptTemplate: "双语报告：\n{analyze}\n\n{translate}",   depends: ["analyze", "translate"] },
  ],
};

const result = await agent.runWorkflow(workflow, "2024年AI行业趋势");
console.log(result.output);
console.log(result.nodeResults);
```

### 条件分支

```ts
const workflow: WorkflowDefinition = {
  name: "smart-answer",
  nodes: [
    {
      id: "classify",
      type: "llm",
      promptTemplate: "判断复杂度，只输出 simple 或 complex：{input}",
      depends: [],
    },
    {
      id: "router",
      type: "branch",
      condition: (ctx) => ctx["classify"].includes("complex") ? "complex" : "simple",
      branches: {
        simple:  [{ id: "quick",  type: "llm", promptTemplate: "简洁回答：{input}",  depends: [] }],
        complex: [{ id: "detail", type: "llm", promptTemplate: "详细分析：{input}", depends: [] }],
      },
      depends: ["classify"],
    },
  ],
};
```

### 循环

```ts
const workflow: WorkflowDefinition = {
  name: "iterative-refine",
  nodes: [
    {
      id: "refine",
      type: "loop",
      maxIterations: 3,
      condition: (ctx) => !ctx["improve"]?.includes("满意"),
      body: [
        { id: "critique", type: "llm", promptTemplate: "批评：{refine}",       depends: [] },
        { id: "improve",  type: "llm", promptTemplate: "根据批评改进：{critique}", depends: ["critique"] },
      ],
    },
  ],
};
```

### 配置项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `llm` | `LLMClient` | 必填 | LLM 实例 |
| `registry` | `ToolRegistry` | — | `tool` 节点必须提供 |
| `verbose` | `boolean` | `false` | 打印每个波次的执行日志 |
| `maxConcurrency` | `number` | 不限制 | 单波次最大并发节点数 |

> 如需不经过 Agent 层直接使用 `WorkflowEngine`，参阅 [@agenticforge/workflow](/zh/packages/workflow)。
