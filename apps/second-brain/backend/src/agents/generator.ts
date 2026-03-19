import "dotenv/config";
import { ReflectionAgent, LLMClient } from "@agenticforge/kit";
import { episodicMemory } from "../memory/index.js";

const llm = new LLMClient({ provider: "openai", model: "gpt-4o" });

export const generatorAgent = new ReflectionAgent({
  llm,
  reflectionRounds: 2,
  systemPrompt: "You are a knowledge insight generator. Generate high-quality summaries, reports, and insights from the knowledge base. Self-critique and refine each output.",
});

export async function generateWeeklyInsight(): Promise<string> {
  const episodes = await episodicMemory.retrieve({ limit: 20 });
  const items = episodes.map((e: { timestamp: number | string | Date; content: string }) =>
    `- ${new Date(e.timestamp).toLocaleDateString()}: ${e.content}`
  ).join("\n");
  return generatorAgent.run(`Generate a weekly knowledge insight report based on:\n\n${items}`);
}

export default generatorAgent;