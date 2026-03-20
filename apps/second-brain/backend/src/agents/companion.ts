import "dotenv/config";
import { SimpleAgent, LLMClient, ContextBuilder } from "@agenticforge/kit";
import { workingMemory } from "../memory/index.js";
import type { LLMMessage } from "@agenticforge/kit";

const llm = new LLMClient();

export const companionAgent = new SimpleAgent({
  name: "companion",
  llm,
  systemPrompt: "You are the user AI knowledge assistant. Answer concisely and clearly.",
});

export async function smartChat(userQuery: string): Promise<string> {
  const recent = await workingMemory.getRecent(20);
  const history = recent
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
    .map((m) => ({
      role: (m.metadata["role"] as "user" | "assistant") ?? "user",
      content: m.content,
    })) as Array<{role: "user" | "assistant" | "system"; content: string}>;

  const ctx = new ContextBuilder({ config: { maxTokens: 6000 } });
  const built = await ctx.build({
    userQuery,
    systemInstructions: "You are an AI knowledge assistant helping users query their knowledge base.",
    conversationHistory: history,
  });
  const response = await llm.think(built.messages);
  const now = new Date();
  await workingMemory.add({ id: crypto.randomUUID(), content: userQuery, memoryType: "working", userId: "default", timestamp: now, importance: 0.6, metadata: { role: "user" } });
  await workingMemory.add({ id: crypto.randomUUID(), content: response, memoryType: "working", userId: "default", timestamp: new Date(now.getTime() + 1), importance: 0.6, metadata: { role: "assistant" } });
  return response;
}

export default companionAgent;
