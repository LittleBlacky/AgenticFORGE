/**
 * COTAgent 演示
 *
 * 展示 Chain of Thought（链式思维）智能体的三种用法：
 * 1. 基础推理（run）
 * 2. 流式推理（streamRun）
 * 3. 检查推理步骤（getSteps / getLastTrace）
 *
 * 运行方式：
 *   node scripts/run-example.js examples/cotAgent.demo.ts
 */
import "dotenv/config";
import { LLMClient } from "@agenticforge/core";
import { COTAgent } from "@agenticforge/agents";

const llm = new LLMClient({
  provider: "openai",
  model: process.env.MODEL_NAME ?? "gpt-4o",
  baseURL: process.env.OPENAI_BASE_URL,
  apiKey: process.env.OPENAI_API_KEY,
});

// ─── 示例 1：基础推理 ──────────────────────────────────────────────────────────

async function demo1BasicReason() {
  console.log("\n=== 示例 1：基础链式思维推理 ===");

  const agent = new COTAgent({
    name: "cot-basic",
    llm,
    verbose: true, // 在控制台打印推理链
  });

  const answer = await agent.run(
    "一个农场有鸡和兔子共 35 只，共有 94 条腿。问鸡和兔子各有多少只？",
  );

  console.log("最终答案:", answer);
}

// ─── 示例 2：流式推理 ──────────────────────────────────────────────────────────

async function demo2StreamReason() {
  console.log("\n=== 示例 2：流式链式思维推理 ===");

  const agent = new COTAgent({
    name: "cot-stream",
    llm,
  });

  process.stdout.write("推理过程（流式输出）：\n");
  for await (const chunk of agent.streamRun(
    "如果今天是周三，那么再过 100 天是星期几？",
  )) {
    process.stdout.write(chunk);
  }
  console.log("\n");

  // 流式完成后可以检查解析出的步骤
  const steps = agent.getSteps();
  console.log(`解析到 ${steps.length} 个推理步骤：`);
  for (const step of steps) {
    console.log(`  步骤 ${step.stepNumber}: ${step.content.slice(0, 60)}...`);
  }
}

// ─── 示例 3：多轮对话（携带历史） ─────────────────────────────────────────────

async function demo3MultiTurn() {
  console.log("\n=== 示例 3：多轮对话 ===");

  const agent = new COTAgent({
    name: "cot-multi",
    llm,
    verbose: false,
  });

  const q1 = "一列火车从 A 城出发，速度 120 km/h，另一列从 B 城出发速度 80 km/h，两城相距 500 km，同时出发相向而行，多久后相遇？";
  console.log("问题 1:", q1);
  const a1 = await agent.run(q1);
  console.log("回答 1:", a1);

  const trace1 = agent.getLastTrace();
  console.log(`  （推理用了 ${trace1?.steps.length ?? 0} 步）`);

  const q2 = "相遇地点距离 A 城多少公里？";
  console.log("\n问题 2（基于上下文）:", q2);
  const a2 = await agent.run(q2); // 历史自动携带
  console.log("回答 2:", a2);
}

// ─── 示例 4：获取完整推理链 ────────────────────────────────────────────────────

async function demo4InspectTrace() {
  console.log("\n=== 示例 4：获取完整推理链 ===");

  const agent = new COTAgent({
    name: "cot-inspect",
    llm,
  });

  await agent.run(
    "请分析：为什么说'磨刀不误砍柴工'？从时间管理角度给出逻辑推理。",
  );

  const trace = agent.getLastTrace();
  if (!trace) return;

  console.log("输入问题:", trace.inputText);
  console.log(`\n推理步骤（共 ${trace.steps.length} 步）：`);
  for (const step of trace.steps) {
    console.log(`\n  [步骤 ${step.stepNumber}]`);
    console.log(`  ${step.content}`);
  }
  console.log("\n最终答案:", trace.finalAnswer);
  console.log("\n原始输出片段（前 200 字）:", trace.rawOutput.slice(0, 200) + "...");
}

// ─── 主入口 ───────────────────────────────────────────────────────────────────

async function main() {
  try {
    await demo1BasicReason();
    await demo2StreamReason();
    await demo3MultiTurn();
    await demo4InspectTrace();
  } catch (err) {
    console.error("Demo 运行出错:", err);
    process.exit(1);
  }
}

main();
