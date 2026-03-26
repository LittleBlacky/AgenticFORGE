import "dotenv/config";
import { LLMClient, ContextBuilder } from "@agenticforge/kit";
import { SkillLoader, SkillRunner, SkillRegistry } from "@agenticforge/skills";
import { workingMemory } from "../memory/index.js";
import { captureAgent } from "../agents/capture.js";
import { researcherAgent } from "../agents/researcher.js";
import { generatorAgent, generateWeeklyInsight } from "../agents/generator.js";
import { plannerAgent } from "../agents/planner.js";
import { smartChat } from "../agents/companion.js";
import type { MemoryItem } from "@agenticforge/kit";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = path.join(__dirname, "../skills");

const llm = new LLMClient();
let runner: SkillRunner | null = null;

export async function initGateway() {
  const mdSkills = await SkillLoader.fromDirectory(SKILLS_DIR);
  const registry = new SkillRegistry();
  for (const skill of mdSkills) registry.register(skill);
  runner = new SkillRunner({
    llm,
    skills: mdSkills,
    fallbackPrompt: "You are an AI Second Brain assistant, helping users manage and retrieve knowledge.",
  });
  console.log(`[Gateway] Loaded ${mdSkills.length} skills: ${mdSkills.map((s: { name: string }) => s.name).join(", ")}`);
  return runner;
}

export type RouteResult = { agent: string; output: string; skillUsed?: string; };

export async function route(userInput: string): Promise<RouteResult> {
  if (!runner) throw new Error("Gateway not initialized. Call initGateway() first.");
  const recent = await workingMemory.getRecent(10);
  const history = recent
    .sort((a: MemoryItem, b: MemoryItem) => a.timestamp.getTime() - b.timestamp.getTime())
    .map((m: MemoryItem) => ({
      role: (m.metadata["role"] as "user" | "assistant") ?? "user",
      content: m.content,
    }));

  const ctx = new ContextBuilder({ config: { maxTokens: 2000 } });
  const built = await ctx.build({
    userQuery: userInput,
    systemInstructions: "Determine user intent and return exactly one of: capture / research / generate / plan / chat",
    conversationHistory: history,
  });
  const intent = (await llm.think(built.messages)).trim().toLowerCase();
  console.log(`[Gateway] Intent: "${intent}" <- "${userInput.slice(0, 50)}"`);

  const now = new Date();
  await workingMemory.add({ id: crypto.randomUUID(), content: userInput, memoryType: "working", userId: "default", timestamp: now, importance: 0.6, metadata: { role: "user" } });

  let output: string;
  let agent: string;
  switch (intent) {
    case "capture":
      output = await captureAgent.run(userInput); agent = "CaptureAgent (FunctionCallAgent)"; break;
    case "research":
      output = await researcherAgent.run(userInput); agent = "ResearcherAgent (ReActAgent)"; break;
    case "generate":
      output = userInput.toLowerCase().includes("weekly") ? await generateWeeklyInsight() : await generatorAgent.run(userInput);
      agent = "GeneratorAgent (ReflectionAgent)"; break;
    case "plan":
      output = await plannerAgent.run(userInput); agent = "PlannerAgent (PlanSolveAgent)"; break;
    default:
      output = await smartChat(userInput); agent = "CompanionAgent (SimpleAgent)";
  }

  await workingMemory.add({ id: crypto.randomUUID(), content: output, memoryType: "working", userId: "default", timestamp: new Date(now.getTime() + 1), importance: 0.6, metadata: { role: "assistant" } });
  return { agent, output, skillUsed: intent };
}

export { generateWeeklyInsight };

// ── 流式路由 ────────────────────────────────────────────────────────────────
// 对于 capture / research / plan / generate 走各自 agent.run()（无流式）
// 对于 chat（默认）走 LLMClient.streamThink() 实现真正逐 token 推送
export async function* routeStream(
  userInput: string,
): AsyncGenerator<{ token?: string; meta?: { agent: string; skillUsed: string } }> {
  if (!runner) throw new Error("Gateway not initialized. Call initGateway() first.");

  // 1. 判断 intent（非流式，仅一次 LLM 调用）
  const recent = await workingMemory.getRecent(10);
  const history = recent
    .sort((a: MemoryItem, b: MemoryItem) => a.timestamp.getTime() - b.timestamp.getTime())
    .map((m: MemoryItem) => ({
      role: (m.metadata["role"] as "user" | "assistant") ?? "user",
      content: m.content,
    }));

  const ctx = new ContextBuilder({ config: { maxTokens: 2000 } });
  const built = await ctx.build({
    userQuery: userInput,
    systemInstructions: "Determine user intent and return exactly one of: capture / research / generate / plan / chat",
    conversationHistory: history,
  });
  const intent = (await llm.think(built.messages)).trim().toLowerCase();
  console.log(`[Gateway/stream] Intent: "${intent}" <- "${userInput.slice(0, 50)}"`);

  const now = new Date();
  await workingMemory.add({
    id: crypto.randomUUID(), content: userInput, memoryType: "working",
    userId: "default", timestamp: now, importance: 0.6, metadata: { role: "user" },
  });

  // 2. 非对话 intent — 先 yield meta 再 yield 完整输出（逐字）
  if (intent !== "chat") {
    let output: string;
    let agent: string;
    switch (intent) {
      case "capture":
        output = await captureAgent.run(userInput); agent = "CaptureAgent"; break;
      case "research":
        output = await researcherAgent.run(userInput); agent = "ResearcherAgent"; break;
      case "generate":
        output = userInput.toLowerCase().includes("weekly")
          ? await generateWeeklyInsight()
          : await generatorAgent.run(userInput);
        agent = "GeneratorAgent"; break;
      case "plan":
        output = await plannerAgent.run(userInput); agent = "PlannerAgent"; break;
      default:
        output = await plannerAgent.run(userInput); agent = "PlannerAgent";
    }
    // 伪流：将完整输出切成小块推送，前端体验一致
    const CHUNK = 6;
    for (let i = 0; i < output.length; i += CHUNK) {
      yield { token: output.slice(i, i + CHUNK) };
      await new Promise((r) => setTimeout(r, 6));
    }
    yield { meta: { agent, skillUsed: intent } };
  } else {
    // 3. 对话 intent — 真正流式
    const ctxChat = new ContextBuilder({ config: { maxTokens: 6000 } });
    const builtChat = await ctxChat.build({
      userQuery: userInput,
      systemInstructions: "You are an AI knowledge assistant helping users query their knowledge base.",
      conversationHistory: history,
    });

    let full = "";
    for await (const token of llm.streamThink(builtChat.messages)) {
      full += token;
      yield { token };
    }
    yield { meta: { agent: "CompanionAgent", skillUsed: "chat" } };

    await workingMemory.add({
      id: crypto.randomUUID(), content: full, memoryType: "working",
      userId: "default", timestamp: new Date(now.getTime() + 1), importance: 0.6,
      metadata: { role: "assistant" },
    });
  }
}
