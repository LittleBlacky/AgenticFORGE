/**
 * WorkflowAgent Demo
 *
 * 演示三种典型用法：
 * 1. 线性流水线（fetch → analyze → report）
 * 2. 并发 + 聚合（fan-out/fan-in DAG）
 * 3. 混合节点类型（tool + llm + fn）
 */

import "dotenv/config";
import {LLMClient} from "@agenticforge/core";
import {WorkflowAgent} from "@agenticforge/agents";
import type {WorkflowDefinition} from "@agenticforge/agents";
import {Tool, ToolRegistry, toolAction} from "@agenticforge/tools";
import {z} from "zod";

const llm = new LLMClient({provider: "openai", model: "gpt-4o"});

// ---------------------------------------------------------------------------
// 示例工具
// ---------------------------------------------------------------------------

const mockSearchTool = new Tool({
  name: "search",
  description: "模拟网络搜索，返回与查询相关的摘要文本",
  parameters: [{name: "input", type: "string", required: true}],
  action: toolAction(
    z.object({input: z.string()}),
    async ({input}) =>
      `[搜索结果] 关于「${input}」的最新资讯：AI 技术在 2024 年持续高速发展，` +
      `大模型落地场景不断扩展，行业投资规模同比增长 60%。`,
  ),
});

const registry = new ToolRegistry();
registry.registerTool(mockSearchTool);

// ---------------------------------------------------------------------------
// 示例 1：线性流水线
// ---------------------------------------------------------------------------

async function demo1Linear() {
  console.log("\n=== Demo 1: 线性流水线（fetch → analyze → report）===");

  const definition: WorkflowDefinition = {
    name: "linear-report",
    nodes: [
      {
        id: "fetch",
        type: "tool",
        toolName: "search",
        inputTemplate: "{input}",
        depends: [],
      },
      {
        id: "analyze",
        type: "llm",
        promptTemplate: "请对以下搜索结果进行深度分析，提炼核心趋势（100字以内）：\n{fetch}",
        depends: ["fetch"],
      },
      {
        id: "report",
        type: "llm",
        systemPrompt: "你是一位专业的行业分析师，擅长撰写简洁有力的分析报告。",
        promptTemplate: "基于以下分析，撰写一段 150 字的行业简报：\n{analyze}",
        depends: ["analyze"],
      },
    ],
  };

  const agent = new WorkflowAgent({
    name: "linear-agent",
    llm,
    registry,
    verbose: true,
  });

  const result = await agent.runWorkflow(definition, "2024年AI行业发展趋势");
  console.log("\n[最终报告]", result.output);
  console.log("[节点耗时]", result.nodeResults.map((r) => `${r.nodeId}: ${r.durationMs}ms`));
}

// ---------------------------------------------------------------------------
// 示例 2：并发 fan-out / fan-in DAG
// ---------------------------------------------------------------------------

async function demo2FanOutIn() {
  console.log("\n=== Demo 2: 并发 fan-out/fan-in（fetch → [analyze, translate] → report）===");

  const definition: WorkflowDefinition = {
    name: "fanout-report",
    nodes: [
      {
        id: "fetch",
        type: "tool",
        toolName: "search",
        inputTemplate: "{input}",
        depends: [],
      },
      // analyze 和 translate 并发执行，都依赖 fetch
      {
        id: "analyze",
        type: "llm",
        promptTemplate: "分析以下内容的核心观点（50字以内）：\n{fetch}",
        depends: ["fetch"],
      },
      {
        id: "translate",
        type: "llm",
        promptTemplate: "将以下内容翻译成英文：\n{fetch}",
        depends: ["fetch"],
      },
      // report 等待 analyze 和 translate 都完成后执行
      {
        id: "report",
        type: "llm",
        promptTemplate:
          "请综合以下中文分析和英文翻译，写出双语简报：\n\n【分析】\n{analyze}\n\n【英文版】\n{translate}",
        depends: ["analyze", "translate"],
      },
    ],
  };

  const agent = new WorkflowAgent({
    name: "fanout-agent",
    llm,
    registry,
    verbose: true,
  });

  const result = await agent.runWorkflow(definition, "大模型在企业中的落地现状");
  console.log("\n[双语简报]", result.output);
}

// ---------------------------------------------------------------------------
// 示例 3：fn 节点（自定义逻辑）
// ---------------------------------------------------------------------------

async function demo3FnNode() {
  console.log("\n=== Demo 3: fn 节点（自定义逻辑合并多个输出）===");

  const definition: WorkflowDefinition = {
    name: "fn-merge",
    nodes: [
      {
        id: "part1",
        type: "llm",
        promptTemplate: "用一句话描述 {input} 的机遇。",
        depends: [],
      },
      {
        id: "part2",
        type: "llm",
        promptTemplate: "用一句话描述 {input} 的挑战。",
        depends: [],
      },
      {
        id: "merge",
        type: "fn",
        depends: ["part1", "part2"],
        executor: async (ctx) => {
          return `【机遇】${ctx["part1"]}\n【挑战】${ctx["part2"]}`;
        },
      },
    ],
  };

  const agent = new WorkflowAgent({
    name: "fn-agent",
    llm,
    verbose: true,
  });

  const result = await agent.runWorkflow(definition, "生成式AI");
  console.log("\n[合并结果]", result.output);
}

// ---------------------------------------------------------------------------
// 示例 4：setWorkflow + run 接口
// ---------------------------------------------------------------------------

async function demo4SetWorkflow() {
  console.log("\n=== Demo 4: setWorkflow() + run() 接口===");

  const definition: WorkflowDefinition = {
    name: "simple-summary",
    nodes: [
      {
        id: "summary",
        type: "llm",
        promptTemplate: "用三句话总结 {input} 的现状。",
        depends: [],
      },
    ],
  };

  const agent = new WorkflowAgent({name: "simple-agent", llm, verbose: false});
  agent.setWorkflow(definition);

  // 连续调用 run()，history 自动累积
  const r1 = await agent.run("量子计算");
  const r2 = await agent.run("边缘计算");
  console.log("[量子计算]", r1);
  console.log("[边缘计算]", r2);
  console.log("[history 长度]", agent.getHistory().length); // 4 条（2 user + 2 assistant）
}

// ---------------------------------------------------------------------------
// 运行所有示例
// ---------------------------------------------------------------------------

(async () => {
  await demo1Linear();
  await demo2FanOutIn();
  await demo3FnNode();
  await demo4SetWorkflow();
})();
