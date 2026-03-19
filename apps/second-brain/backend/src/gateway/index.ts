import { SkillAgent, LLMClient, ContextBuilder } from "@agenticforge/kit";
import { SkillLoader, SkillRunner, SkillRegistry } from "@agenticforge/skills";
import { workingMemory } from "../memory/index.js";
import { captureAgent } from "../agents/capture.js";
import { researcherAgent } from "../agents/researcher.js";
import { generatorAgent, generateWeeklyInsight } from "../agents/generator.js";
import { plannerAgent } from "../agents/planner.js";
import { smartChat } from "../agents/companion.js";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = path.join(__dirname, "../skills");

const llm = new LLMClient({ provider: "openai", model: "gpt-4o" });
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
  const history = workingMemory.getLast(10);
  const ctx = new ContextBuilder({ maxTokens: 2000 });
  ctx.addSystem("Determine user intent and return exactly one of: capture / research / generate / plan / chat\n- capture: user wants to save, bookmark, record content or URL\n- research: user wants to research or analyze a topic in depth\n- generate: user wants to generate reports, summaries, insights, weekly reports\n- plan: user wants to make plans, learning paths, task decomposition\n- chat: other everyday Q&A\nOutput only one word, no explanation.");
  ctx.addHistory(history);
  ctx.addUser(userInput);
  const intent = (await llm.think(ctx.build())).trim().toLowerCase();
  console.log(`[Gateway] Intent: "${intent}" <- "${userInput.slice(0, 50)}"`);
  workingMemory.add({ role: "user", content: userInput });
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
  workingMemory.add({ role: "assistant", content: output });
  return { agent, output, skillUsed: intent };
}

export { generateWeeklyInsight };