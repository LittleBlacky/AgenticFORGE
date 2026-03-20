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
