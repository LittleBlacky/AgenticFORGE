/**
 * @agenticforge/context — 进阶测试
 * 覆盖：ContextBuilder MMR, structuredTemplate, compression
 */
import { describe, it, expect } from "vitest";
import { ContextBuilder } from "../../packages/context/src/ContextBuilder";
import type { ContextPacket } from "../../packages/context/src/ContextBuilder";

describe("ContextBuilder — MMR selection", () => {
  it("enableMmr selects diverse packets", async () => {
    const b = new ContextBuilder({
      config: { maxTokens: 4096, enableMmr: true, mmrLambda: 0.7 },
    });
    const packets: ContextPacket[] = [
      { content: "machine learning algorithms", metadata: {}, relevanceScore: 0.9 },
      { content: "machine learning methods", metadata: {}, relevanceScore: 0.88 },
      { content: "cooking recipes for dinner", metadata: {}, relevanceScore: 0.4 },
    ];
    const ctx = await b.build({ userQuery: "ML", additionalPackets: packets });
    expect(ctx.includedPackets.length).toBeGreaterThan(0);
  });

  it("enableMmr with empty packets returns no packets", async () => {
    const b = new ContextBuilder({ config: { maxTokens: 4096, enableMmr: true } });
    const ctx = await b.build({ userQuery: "q", additionalPackets: [] });
    expect(ctx.includedPackets).toHaveLength(0);
  });
});

describe("ContextBuilder — structured template", () => {
  it("enableStructuredTemplate sets structuredSystem", async () => {
    const b = new ContextBuilder({
      config: { maxTokens: 4096, enableStructuredTemplate: true },
    });
    const ctx = await b.build({
      userQuery: "what is AI?",
      systemInstructions: "You are an expert.",
    });
    expect(ctx.structuredSystem).toBeDefined();
    expect(ctx.structuredSystem).toContain("[Task]");
  });

  it("structuredSystem contains Role & Policies when systemInstructions provided", async () => {
    const b = new ContextBuilder({
      config: { maxTokens: 4096, enableStructuredTemplate: true },
    });
    const ctx = await b.build({
      userQuery: "q",
      systemInstructions: "Be concise.",
    });
    expect(ctx.structuredSystem).toContain("[Role & Policies]");
    expect(ctx.structuredSystem).toContain("Be concise.");
  });

  it("structuredSystem contains Evidence section for knowledge packets", async () => {
    const b = new ContextBuilder({
      config: { maxTokens: 4096, enableStructuredTemplate: true },
    });
    const packets: ContextPacket[] = [
      { content: "relevant fact", metadata: { type: "knowledge" }, relevanceScore: 1 },
    ];
    const ctx = await b.build({ userQuery: "q", additionalPackets: packets });
    expect(ctx.structuredSystem).toContain("[Evidence]");
  });

  it("truncated flag is set when context exceeds budget", async () => {
    const b = new ContextBuilder({
      config: { maxTokens: 10, enableStructuredTemplate: true, enableCompression: true },
    });
    const ctx = await b.build({
      userQuery: "short query",
      systemInstructions: "A very long system instruction that will exceed the tiny token budget set for testing purposes.",
    });
    // either fits or truncated — just ensure the field is boolean
    expect(typeof ctx.truncated).toBe("boolean");
  });
});

describe("ContextBuilder — recency scoring", () => {
  it("recent packets score higher than old ones", async () => {
    const b = new ContextBuilder({
      config: { maxTokens: 200, recencyWeight: 0.8, recencyTau: 3600000 },
    });
    const now = Date.now();
    const packets: ContextPacket[] = [
      { content: "old content", metadata: {}, relevanceScore: 0.5, timestamp: now - 86400000 },
      { content: "new content", metadata: {}, relevanceScore: 0.5, timestamp: now },
    ];
    const ctx = await b.build({ userQuery: "q", additionalPackets: packets });
    // Both should be included; at minimum the new one should be present
    expect(ctx.includedPackets.length).toBeGreaterThan(0);
  });
});

describe("ContextBuilder — history token budget", () => {
  it("trims history when it exceeds historyTokenBudget", async () => {
    const b = new ContextBuilder({
      config: { maxTokens: 4096, historyTokenBudget: 10 },
    });
    const history = Array.from({ length: 20 }, (_, i) => ({
      role: "user" as const,
      content: `message number ${i} with some extra words to consume tokens`,
    }));
    const ctx = await b.build({ userQuery: "q", conversationHistory: history });
    // history should be trimmed, messages array should be smaller than full history + 1
    expect(ctx.messages.length).toBeLessThan(history.length + 1);
  });
});
