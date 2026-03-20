/**
 * @agenticforge/context — 单元测试
 * 覆盖：estimateTokens, createTokenCounter, ContextPacketBuilder, ContextBuilder
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  ContextBuilder,
  ContextPacketBuilder,
} from "../../packages/context/src/ContextBuilder";
import type { ContextPacket } from "../../packages/context/src/ContextBuilder";
import { estimateTokens, createTokenCounter } from "../../packages/context/src/tokenizer";

// ===========================================================================
// estimateTokens
// ===========================================================================
describe("estimateTokens", () => {
  it("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("uses ceil(length/4) by default", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
  });

  it("uses provided TokenCounter", () => {
    const counter = createTokenCounter({ charsPerToken: 2 });
    expect(estimateTokens("abcd", counter)).toBe(2);
  });
});

describe("createTokenCounter", () => {
  it("default 4 chars/token", () => {
    const c = createTokenCounter();
    expect(c.count("abcd")).toBe(1);
    expect(c.count("abcde")).toBe(2);
  });

  it("custom chars/token", () => {
    const c = createTokenCounter({ charsPerToken: 1 });
    expect(c.count("abc")).toBe(3);
  });
});

// ===========================================================================
// ContextPacketBuilder
// ===========================================================================
describe("ContextPacketBuilder", () => {
  it("create() builds packet with content and metadata", () => {
    const p = ContextPacketBuilder.create("hello", { tag: "test" });
    expect(p.content).toBe("hello");
    expect(p.metadata.tag).toBe("test");
  });

  it("create() with empty metadata defaults to {}", () => {
    const p = ContextPacketBuilder.create("hi");
    expect(p.metadata).toEqual({});
  });

  it("withRelevance() sets relevanceScore", () => {
    const p = ContextPacketBuilder.create("text");
    const scored = ContextPacketBuilder.withRelevance(p, 0.9);
    expect(scored.relevanceScore).toBe(0.9);
    expect(scored.content).toBe("text"); // original fields preserved
  });
});

// ===========================================================================
// ContextBuilder — build()
// ===========================================================================
describe("ContextBuilder", () => {
  let builder: ContextBuilder;

  beforeEach(() => {
    builder = new ContextBuilder({ config: { maxTokens: 4096 } });
  });

  it("build() returns BuiltContext with required fields", async () => {
    const ctx = await builder.build({ userQuery: "hello" });
    expect(ctx.system).toBeDefined();
    expect(ctx.messages).toBeDefined();
    expect(ctx.totalTokens).toBeGreaterThanOrEqual(0);
    expect(ctx.includedPackets).toBeDefined();
    expect(typeof ctx.truncated).toBe("boolean");
  });

  it("build() includes userQuery as last user message", async () => {
    const ctx = await builder.build({ userQuery: "test query" });
    const last = ctx.messages[ctx.messages.length - 1];
    expect(last?.role).toBe("user");
    expect(last?.content).toBe("test query");
  });

  it("build() sets system from systemInstructions", async () => {
    const ctx = await builder.build({
      userQuery: "q",
      systemInstructions: "You are helpful.",
    });
    expect(ctx.system).toBe("You are helpful.");
  });

  it("build() includes conversation history", async () => {
    const ctx = await builder.build({
      userQuery: "follow-up",
      conversationHistory: [
        { role: "user", content: "first" },
        { role: "assistant", content: "response" },
      ],
    });
    const roles = ctx.messages.map(m => m.role);
    expect(roles).toContain("user");
    expect(roles).toContain("assistant");
  });

  it("build() respects minRelevance filter", async () => {
    const b = new ContextBuilder({ config: { maxTokens: 4096, minRelevance: 0.8 } });
    const packets: ContextPacket[] = [
      { content: "low relevance", metadata: {}, relevanceScore: 0.3 },
      { content: "high relevance", metadata: {}, relevanceScore: 0.9 },
    ];
    const ctx = await b.build({ userQuery: "q", additionalPackets: packets });
    expect(ctx.includedPackets.every(p => (p.relevanceScore ?? 1) >= 0.8)).toBe(true);
  });

  it("build() includes all packets when minRelevance is 0", async () => {
    const packets: ContextPacket[] = [
      { content: "packet A", metadata: {}, relevanceScore: 0.1 },
      { content: "packet B", metadata: {}, relevanceScore: 0.5 },
    ];
    const ctx = await builder.build({ userQuery: "q", additionalPackets: packets });
    expect(ctx.includedPackets.length).toBe(2);
  });

  it("build() respects maxTokens budget", async () => {
    const b = new ContextBuilder({ config: { maxTokens: 20 } });
    const packets: ContextPacket[] = Array.from({ length: 20 }, (_, i) => ({
      content: `packet content number ${i} with extra words`,
      metadata: {},
      relevanceScore: 1,
    }));
    const ctx = await b.build({ userQuery: "q", additionalPackets: packets });
    expect(ctx.totalTokens).toBeLessThanOrEqual(30); // small budget
  });

  it("build() with empty input returns valid context", async () => {
    const ctx = await builder.build({ userQuery: "" });
    expect(ctx.messages).toHaveLength(1); // just the empty user message
  });
});
