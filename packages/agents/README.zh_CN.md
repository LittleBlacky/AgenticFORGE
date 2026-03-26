# @agenticforge/agents

[![npm](https://img.shields.io/npm/v/@agenticforge/agents)](https://www.npmjs.com/package/@agenticforge/agents)
[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)

<p><strong>中文</strong> | <a href="./README.md">English</a></p>

AgenticFORGE 内置 Agent 实现 —— 从简单聊天机器人到多 Skill 助理，再到并发 DAG 工作流引擎。

## 安装

```bash
npm install @agenticforge/agents
```

---

## 选择合适的 Agent

| Agent | 适用场景 |
|-------|----------|
| `SimpleAgent` | 无工具的对话 —— 摘要、问答、写作 |
| `FunctionCallAgent` | 需要可靠调用 API 或工具 |
| `ReActAgent` | 复杂多步推理，Agent 需要边思考边行动 |
| `PlanSolveAgent` | 长任务，先制定完整计划再逐步执行 |
| `ReflectionAgent` | 高质量输出，需要自我批评和迭代优化 |
| `SkillAgent` | 多种独立能力，每个请求路由到对应专家 Skill |
| `WorkflowAgent` | 固定流程的自动化，步骤可并发执行 |

---

## SimpleAgent — 对话助理

```ts
import { SimpleAgent, LLMClient } from "@agenticforge/agents";

const agent = new SimpleAgent({
  name: "support-bot",
  llm: new LLMClient({ provider: "openai", model: "gpt-4o" }),
  systemPrompt: "你是一个友好的电商客服，回答简洁。",
});

const r1 = await agent.run("我上周的订单还没到。");
const r2 = await agent.run("订单号是 #98234。"); // 携带上一轮历史
const r3 = await agent.run("能退款吗？");
agent.clearHistory();
```

---

## FunctionCallAgent — 工具调用

```ts
import { FunctionCallAgent, LLMClient } from "@agenticforge/agents";
import { Tool, type ToolParameter } from "@agenticforge/tools";

class FlightStatusTool extends Tool {
  constructor() { super("check_flight", "查询航班实时状态。"); }
  getParameters(): ToolParameter[] {
    return [{ name: "flight_number", type: "string", description: "航班号，如 CA123", required: true, default: null }];
  }
  async run(params: Record<string, unknown>): Promise<string> {
    return `航班 ${params.flight_number}：准点，14:30 起飞，B12 登机口`;
  }
}

const agent = new FunctionCallAgent({
  name: "travel-assistant",
  llm: new LLMClient({ provider: "openai", model: "gpt-4o" }),
  tools: [new FlightStatusTool()],
  maxIterations: 5,
});

const result = await agent.run("我的 CA456 航班准点吗？");
// => "您的 CA456 航班准点！14:30 在 B12 登机口起飞。"
```

---

## ReActAgent — 推理 + 行动

```ts
import { ReActAgent, LLMClient } from "@agenticforge/agents";

const agent = new ReActAgent({
  llm: new LLMClient({ provider: "openai", model: "gpt-4o" }),
  tools: [new WebSearchTool(), new CalculatorTool()],
  maxIterations: 15,
});

// Agent 会搜索、推理、再搜索，最终综合回答
const result = await agent.run("2023 年越南 GDP 增速是多少？与东盟平均水平相比如何？");
```

---

## PlanSolveAgent — 先规划后执行

```ts
const agent = new PlanSolveAgent({
  llm: new LLMClient({ provider: "openai", model: "gpt-4o" }),
  tools: [new WebSearchTool()],
});

const result = await agent.run("调研 2024 年欧盟 AI 法规，写一份 600 字中文摘要。");
```

> 每次 `run()` 发出 **2 次 LLM 调用**（规划 + 执行）。简单任务请勿使用。

---

## ReflectionAgent — 自我反思循环

```ts
const agent = new ReflectionAgent({
  llm: new LLMClient({ provider: "openai", model: "gpt-4o" }),
  reflectionRounds: 2,
  systemPrompt: "你是专业的产品文案撰写者。",
});

const result = await agent.run("为一款降噪 AI 耳机写 3 句产品介绍。");
// 生成初稿 → 批评 → 改进 → 批评 → 改进
```

> `reflectionRounds: 2` 消耗 **3 倍 token**，请谨慎使用。

---

## SkillAgent — 多能力路由

将请求路由到最合适的 Skill。使用两级策略：**关键词规则路由**（零 LLM 开销）优先，**LLM 意图路由**兜底。

```ts
import { SkillAgent } from "@agenticforge/agents";
import { SkillLoader } from "@agenticforge/skills";

const mdSkills = await SkillLoader.fromDirectory("./skills");

const agent = new SkillAgent({
  name: "ecommerce-support",
  llm,
  skills: [...mdSkills, new OrderLookupSkill()],
  fallbackPrompt: "你是专业的电商客服。",
});

await agent.run("我的订单什么时候到？");       // => 物流查询 Skill
await agent.run("我被重复扣款了。");           // => 账单支持 Skill
await agent.run("退货政策是什么？");           // => 退货政策 Skill
await agent.runSkill("order-lookup", "追踪订单 #99887"); // 直接调用
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

await agent.run("你们的数据保留政策是什么？");             // => FAQ Skill 命中
await agent.run("对比台积电和三星 2024 年 Q3 的营收。"); // => 落入 ReAct 循环
```

**注入的方法：**

| 方法 | 说明 |
|------|------|
| `addSkill(skill)` | 注册 Skill |
| `removeSkill(name)` | 注销 Skill |
| `listSkills()` | 列出已注册名称 |
| `loadSkillsFromDir(dir)` | 批量从目录加载 |
| `getDispatcher()` | 获取底层 `SkillDispatcher` |
| `skillRegistry` | 直接访问 `SkillRegistry` |

---

## WorkflowAgent — DAG 流水线

按 DAG 拓扑顺序执行节点，无互相依赖的节点并发执行。

```ts
import { WorkflowAgent, LLMClient } from "@agenticforge/agents";
import type { WorkflowDefinition } from "@agenticforge/workflow";

const agent = new WorkflowAgent({
  name: "competitive-analysis",
  llm: new LLMClient({ provider: "openai", model: "gpt-4o" }),
  verbose: true,
});

const workflow: WorkflowDefinition = {
  name: "competitor-report",
  nodes: [
    { id: "fetch_a",   type: "tool", toolName: "search", inputTemplate: "{input} 公司财报",    depends: [] },
    { id: "fetch_b",   type: "tool", toolName: "search", inputTemplate: "{input} 竞争对手财报", depends: [] },
    { id: "analyze_a", type: "llm",  promptTemplate: "分析：{fetch_a}",                         depends: ["fetch_a"] },
    { id: "analyze_b", type: "llm",  promptTemplate: "分析：{fetch_b}",                         depends: ["fetch_b"] },
    { id: "report",    type: "llm",  promptTemplate: "写竞品对比报告：\n{analyze_a}\n{analyze_b}", depends: ["analyze_a", "analyze_b"] },
  ],
};

// fetch_a 和 fetch_b 并发 → analyze_a 和 analyze_b 并发 → report 最后执行
const result = await agent.runWorkflow(workflow, "台积电 vs 三星");
console.log(result.output);
console.log(result.nodeResults); // 每个节点的耗时和状态
```

支持节点类型：`tool` · `llm` · `fn` · `passthrough` · `branch` · `loop`

---

## 链接

- [GitHub](https://github.com/LittleBlacky/AgenticFORGE/tree/main/packages/agents)
- [npm](https://www.npmjs.com/package/@agenticforge/agents)
- [主项目 README](https://github.com/LittleBlacky/AgenticFORGE)
