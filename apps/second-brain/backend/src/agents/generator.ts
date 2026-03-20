import "dotenv/config";
import { ReflectionAgent, LLMClient } from "@agenticforge/kit";
import { episodicMemory } from "../memory/index.js";
import type { MemoryItem } from "@agenticforge/kit";

const llm = new LLMClient();

export const generatorAgent = new ReflectionAgent({
  name: "generator",
  llm,
  maxRounds: 2,
  systemPrompt: "You are a knowledge insight generator. Generate high-quality summaries, reports, and insights from the knowledge base. Self-critique and refine each output.",
});

export async function generateWeeklyInsight(): Promise<string> {
  const episodes = await episodicMemory.retrieve("weekly insight", 20);
  const items = episodes
    .map((e: MemoryItem) => `- ${new Date(e.timestamp).toLocaleDateString()}: ${e.content}`)
    .join("\n");
  return generatorAgent.run(`Generate a weekly knowledge insight report based on:\n\n${items}`);
}

export default generatorAgent;
