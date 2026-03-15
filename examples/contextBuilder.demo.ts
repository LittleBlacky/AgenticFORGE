import {ContextBuilder, ContextPacketBuilder, createTokenCounter} from "../src/context";
import type {Message} from "../src/core/message";
import "dotenv/config";

async function runDemo() {
  const builder = new ContextBuilder({
    config: {
      maxTokens: 1200,
      minRelevance: 0,
      enableMmr: true,
      mmrVectorCacheSize: 128,
      enableMmrVectorCache: true,
      tokenCounter: createTokenCounter({encodingName: "cl100k_base"}),
    },
  });

  const conversationHistory: Message[] = [
    {role: "user", content: "我在做一个 RAG 项目，需要压缩上下文"},
    {role: "assistant", content: "可以通过 MMR 选取多样性信息"},
    {role: "user", content: "还需要控制 token 预算"},
  ];

  const additionalPackets = [
    ContextPacketBuilder.create(
      "项目阶段：已完成原型验证，正在接入向量检索。阻塞：上下文过长导致响应不稳定。",
      {type: "task_state", importance: "high"},
    ),
    ContextPacketBuilder.create(
      "MMR 通过在相关性与多样性之间权衡，减少重复片段被选择。",
      {type: "tool_result"},
    ),
    ContextPacketBuilder.create(
      "Tokenizer 可以精确估算 token，建议在生产环境接入真实 tokenizer。",
      {type: "related_memory"},
    ),
  ];

  const context = await builder.build({
    userQuery: "如何在 ContextBuilder 中使用 MMR 与 tokenizer?",
    conversationHistory,
    systemInstructions: "你是一个专业的 SDK 讲解助手，请简洁回答。",
    additionalPackets,
  });

  console.log("=== ContextBuilder 输出 ===");
  console.log(context);
}

runDemo().catch((error) => {
  console.error("ContextBuilder demo 失败:", error);
  process.exitCode = 1;
});
