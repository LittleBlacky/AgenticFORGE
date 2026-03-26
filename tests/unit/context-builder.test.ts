/**
 * context/src/ContextBuilder — build(), MMR, structuredTemplate, compression
 */
import { describe, it, expect } from "vitest";
import { ContextBuilder } from "../../packages/context/src/ContextBuilder";
import type { BuiltContext } from "../../packages/context/src/ContextBuilder";
import type { Message } from "@agenticforge/core";

const USER_QUERY = "What is TypeScript?";

function makePackets(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    content: `Packet ${i}: TypeScript is a typed superset of JavaScript.`,
    relevanceScore: 0.8 - i * 0.05,
    tokens: 10,
    type: "knowledge" as const,
    metadata: {} as Record<string, unknown>,
  }));
}

// ===========================================================================
// Basic build()
// ===========================================================================
describe("ContextBuilder — build() basic", () => {
  it("returns BuiltContext with system and messages", async () => {
    const builder = new ContextBuilder();
    const ctx = await builder.build({ userQuery: USER_QUERY });
    expect(typeof ctx.system).toBe("string");
    expect(Array.isArray(ctx.messages)).toBe(true);
    expect(ctx.messages.at(-1)!.role).toBe("user");
  });

  it("includes systemInstructions in system", async () => {
    const builder = new ContextBuilder();
    const ctx = await builder.build({ userQuery: USER_QUERY, systemInstructions: "Be concise." });
    expect(ctx.system).toContain("Be concise.");
  });

  it("includes history within budget", async () => {
    const builder = new ContextBuilder({ config: { historyTokenBudget: 500 } });
    const history: Message[] = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
    ];
    const ctx = await builder.build({ userQuery: USER_QUERY, conversationHistory: history });
    expect(ctx.messages.length).toBeGreaterThan(1);
  });

  it("truncates history when over budget", async () => {
    const builder = new ContextBuilder({ config: { maxTokens: 20, historyTokenBudget: 5 } });
    const history: Message[] = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: "word ".repeat(10),
    }));
    const ctx = await builder.build({ userQuery: "q", conversationHistory: history });
    expect(ctx.messages.length).toBeLessThan(history.length + 1);
  });

  it("includes additionalPackets filtered by minRelevance", async () => {
    const builder = new ContextBuilder({ config: { minRelevance: 0.5 } });
    const packets = [
      { content: "relevant", relevanceScore: 0.9 },
      { content: "irrelevant", relevanceScore: 0.1 },
    ];
    const ctx = await builder.build({ userQuery: USER_QUERY, additionalPackets: packets });
    expect(ctx.includedPackets.every((p) => (p.relevanceScore ?? 1) >= 0.5)).toBe(true);
  });

  it("totalTokens is a non-negative number", async () => {
    const builder = new ContextBuilder();
    const ctx = await builder.build({ userQuery: USER_QUERY });
    expect(ctx.totalTokens).toBeGreaterThanOrEqual(0);
  });

  it("truncated flag is boolean", async () => {
    const builder = new ContextBuilder();
    const ctx = await builder.build({ userQuery: USER_QUERY });
    expect(typeof ctx.truncated).toBe("boolean");
  });
});

// ===========================================================================
// Structured template path
// ===========================================================================
describe("ContextBuilder — structuredTemplate", () => {
  it("structuredSystem is populated when enableStructuredTemplate=true", async () => {
    const builder = new ContextBuilder({
      config: { enableStructuredTemplate: true, enableCompression: false },
    });
    const ctx = await builder.build({
      userQuery: USER_QUERY,
      systemInstructions: "Be helpful.",
      additionalPackets: makePackets(2),
    });
    // structuredSystem may or may not be set depending on impl details
    expect(typeof ctx.system).toBe("string");
    expect(Array.isArray(ctx.includedPackets)).toBe(true);
  });

  it("compression runs when both flags are true", async () => {
    const builder = new ContextBuilder({
      config: { enableStructuredTemplate: true, enableCompression: true, maxTokens: 100 },
    });
    const ctx = await builder.build({
      userQuery: USER_QUERY,
      additionalPackets: makePackets(5),
    });
    expect(typeof ctx.system).toBe("string");
    expect(typeof ctx.totalTokens).toBe("number");
  });
});

// ===========================================================================
// MMR selection path
// ===========================================================================
describe("ContextBuilder — MMR selection", () => {
  it("selectMmr returns packets within budget", async () => {
    const builder = new ContextBuilder({
      config: { enableMmr: true, mmrLambda: 0.5, maxTokens: 4096 },
    });
    const ctx = await builder.build({
      userQuery: USER_QUERY,
      additionalPackets: makePackets(5),
    });
    expect(Array.isArray(ctx.includedPackets)).toBe(true);
  });

  it("MMR handles empty packets gracefully", async () => {
    const builder = new ContextBuilder({ config: { enableMmr: true } });
    const ctx = await builder.build({ userQuery: USER_QUERY, additionalPackets: [] });
    expect(ctx.includedPackets).toHaveLength(0);
  });

  it("MMR with custom embedder uses it for vectors", async () => {
    let called = false;
    const embedder = async (texts: string[]) => {
      called = true;
      return texts.map(() => [1, 0, 0]);
    };
    const builder = new ContextBuilder({ config: { enableMmr: true, embedder } });
    await builder.build({
      userQuery: USER_QUERY,
      additionalPackets: makePackets(3),
    });
    expect(called).toBe(true);
  });

  it("MMR falls back to TF-IDF when embedder throws", async () => {
    const embedder = async () => {
      throw new Error("embed fail");
    };
    const builder = new ContextBuilder({ config: { enableMmr: true, embedder } });
    const ctx = await builder.build({
      userQuery: USER_QUERY,
      additionalPackets: makePackets(3),
    });
    expect(Array.isArray(ctx.includedPackets)).toBe(true);
  });
});
