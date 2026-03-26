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
// 示例 5：条件分支（Branch）
// ---------------------------------------------------------------------------

async function demo5Branch() {
  console.log("\n=== Demo 5: 条件分支（Branch）===」");

  const definition: WorkflowDefinition = {
    name: "smart-answer",
    nodes: [
      {
        id: "classify",
        type: "llm",
        promptTemplate:
          "判断以下问题的复杂度，只输出 'simple' 或 'complex' 两个词之一，不要有其他内容：{input}",
        depends: [],
      },
      {
        id: "router",
        type: "branch",
        // condition 接收 ctx，返回分支名
        condition: (ctx) =>
          ctx["classify"].toLowerCase().includes("complex") ? "complex" : "simple",
        branches: {
          simple: [
            {
              id: "quick-answer",
              type: "llm",
              promptTemplate: "请简洁地回答（不超过50字）：{input}",
              depends: [],
            },
          ],
          complex: [
            {
              id: "analysis",
              type: "llm",
              promptTemplate: "请对以下问题进行深入分析（200字以内）：{input}",
              depends: [],
            },
            {
              id: "summary",
              type: "llm",
              promptTemplate: "请将以下分析总结为3个要点：\n{analysis}",
              depends: ["analysis"],
            },
          ],
        },
        depends: ["classify"],
      },
    ],
  };

  const agent = new WorkflowAgent({
    name: "branch-agent",
    llm,
    verbose: true,
  });

  const result = await agent.runWorkflow(definition, "什么是机器学习？");
  console.log("\n[分类结果]", result.context["classify"]);
  console.log("[执行分支]", result.nodeResults.find((r) => r.nodeId === "router")?.branch);
  console.log("[最终回答]", result.output);
}

// ---------------------------------------------------------------------------
// 示例 6：循环节点（Loop）
// ---------------------------------------------------------------------------

async function demo6Loop() {
  console.log("\n=== Demo 6: 循环节点（Loop）— 迭代优化 ===");

  const definition: WorkflowDefinition = {
    name: "iterative-refine",
    nodes: [
      {
        id: "draft",
        type: "llm",
        promptTemplate: "请为以下主题写一段简短介绍（约100字）：{input}",
        depends: [],
      },
      {
        id: "refine",
        type: "loop",
        maxIterations: 3,
        // do-while：每轮执行结束后调用 condition
        // 返回 true 继续，false 停止
        condition: (ctx, iter) => {
          const output = ctx["refine"];
          // 如果输出包含「优化完成」或已达2轮则停止
          return !output.includes("优化完成") && iter < 2;
        },
        body: [
          {
            id: "critique",
            type: "llm",
            // {refine} 引用上一次迭代的输出（首次为空，此时引用 {draft}）
            promptTemplate:
              "请指出以下文章的1个主要不足（简洁指出，不超过30字）：\n" +
              "{refine}" +
              "\n\n如果文章已经很好，请输出「优化完成」。",
            depends: [],
          },
          {
            id: "improve",
            type: "llm",
            promptTemplate:
              "请根据以下批评意见改进文章：\n批评：{critique}\n\n原文：{refine}",
            depends: ["critique"],
          },
        ],
        depends: ["draft"],
      },
    ],
  };

  const agent = new WorkflowAgent({
    name: "loop-agent",
    llm,
    verbose: true,
  });

  const result = await agent.runWorkflow(definition, "AgenticFORGE SDK");
  const loopResult = result.nodeResults.find((r) => r.nodeId === "refine");
  console.log("\n[实际迭代次数]", loopResult?.iterations);
  console.log("[最终输出]", result.output);
}

// ---------------------------------------------------------------------------
// 运行所有示例
// ---------------------------------------------------------------------------

(async () => {
  await demo1Linear();
  await demo2FanOutIn();
  await demo3FnNode();
  await demo4SetWorkflow();
  await demo5Branch();
  await demo6Loop();
})();
