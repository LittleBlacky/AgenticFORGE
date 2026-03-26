/**
 * skills/src/SkillRunner — run(), runSkill(), routing, fallback
 * memory/src/manager — consolidateMemories, clearAllMemories, getMemoryStats
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SkillRunner } from "../../packages/skills/src/SkillRunner";
import { AgentSkill } from "../../packages/skills/src/AgentSkill";
import { MemoryManager } from "../../packages/memory/src/manager";
import { randomUUID } from "node:crypto";
import type { MemoryItem } from "../../packages/memory/src/types/base";

function makeLLM(response = "ok") {
  return {
    think: vi.fn().mockResolvedValue(response),
    streamThink: vi.fn(async function* () {
      yield response;
    }),
    client: undefined,
    model: "m",
  } as any;
}

function makeItem(overrides: Partial<MemoryItem> = {}): MemoryItem {
  return {
    id: randomUUID(),
    content: "important memory",
    memoryType: "working",
    userId: "u1",
    timestamp: new Date(),
    importance: 0.8,
    metadata: {},
    ...overrides,
  };
}

// ===========================================================================
// SkillRunner
// ===========================================================================
describe("SkillRunner — run()", () => {
  it("falls back to llm when no skills registered", async () => {
    const runner = new SkillRunner({ llm: makeLLM("fallback"), skills: [] });
    const result = await runner.run("q");
    expect(result.output).toBe("fallback");
  });

  it("routes to single skill automatically", async () => {
    const llm = makeLLM("skill-output");
    const skill = new AgentSkill({ name: "weather", description: "weather info" });
    const runner = new SkillRunner({ llm, skills: [skill] });
    const result = await runner.run("weather query");
    expect(typeof result.output).toBe("string");
  });

  it("runs named skill when skillName provided", async () => {
    const llm = makeLLM("named-output");
    const skill = new AgentSkill({ name: "myskill", description: "d" });
    const runner = new SkillRunner({ llm, skills: [skill] });
    const result = await runner.run("q", { skillName: "myskill" });
    expect(typeof result.output).toBe("string");
  });

  it("throws when named skill not found", async () => {
    const runner = new SkillRunner({ llm: makeLLM(), skills: [] });
    await expect(runner.run("q", { skillName: "nope" })).rejects.toThrow("nope");
  });

  it("routes among multiple skills via LLM", async () => {
    const llm = makeLLM("weather"); // LLM returns skill name
    const s1 = new AgentSkill({ name: "weather", description: "weather" });
    const s2 = new AgentSkill({ name: "news", description: "news" });
    const runner = new SkillRunner({ llm, skills: [s1, s2] });
    const result = await runner.run("what is the weather?");
    expect(typeof result.output).toBe("string");
  });

  it("falls back when LLM router returns unknown skill name", async () => {
    const llm = makeLLM("unknown-skill");
    const s1 = new AgentSkill({ name: "weather", description: "weather" });
    const s2 = new AgentSkill({ name: "news", description: "news" });
    const runner = new SkillRunner({ llm, skills: [s1, s2] });
    // Should fall back to llm.think
    const result = await runner.run("q");
    expect(typeof result.output).toBe("string");
  });
});

describe("SkillRunner — runSkill()", () => {
  it("runs named skill directly", async () => {
    const llm = makeLLM("direct");
    const skill = new AgentSkill({ name: "s", description: "d" });
    const runner = new SkillRunner({ llm, skills: [skill] });
    const result = await runner.runSkill("s", "q");
    expect(typeof result.output).toBe("string");
  });

  it("throws for unknown skill", async () => {
    const runner = new SkillRunner({ llm: makeLLM(), skills: [] });
    await expect(runner.runSkill("nope", "q")).rejects.toThrow("nope");
  });

  it("passes history to skill context", async () => {
    const llm = makeLLM("ok");
    const skill = new AgentSkill({ name: "s", description: "d" });
    const runner = new SkillRunner({ llm, skills: [skill] });
    const result = await runner.runSkill("s", "q", {
      history: [{ role: "user", content: "prev" }],
    });
    expect(typeof result.output).toBe("string");
  });
});

// ===========================================================================
// MemoryManager — consolidateMemories, clearAllMemories, getMemoryStats
// ===========================================================================
describe("MemoryManager — consolidateMemories", () => {
  it("moves high-importance working memories to episodic", async () => {
    const mgr = new MemoryManager({ enabledTypes: ["working", "episodic"], userId: "u1" });
    await mgr.addMemory({
      content: "important",
      memoryType: "working",
      importance: 0.9,
      userId: "u1",
    });
    const moved = await mgr.consolidateMemories({
      fromType: "working",
      toType: "episodic",
      importanceThreshold: 0.8,
    });
    expect(moved).toBe(1);
  });

  it("returns 0 when fromType not enabled", async () => {
    const mgr = new MemoryManager({ enabledTypes: ["episodic"], userId: "u1" });
    const moved = await mgr.consolidateMemories({ fromType: "working", toType: "episodic" });
    expect(moved).toBe(0);
  });

  it("returns 0 when toType not enabled", async () => {
    const mgr = new MemoryManager({ enabledTypes: ["working"], userId: "u1" });
    const moved = await mgr.consolidateMemories({ fromType: "working", toType: "episodic" });
    expect(moved).toBe(0);
  });

  it("returns 0 when no items meet threshold", async () => {
    const mgr = new MemoryManager({ enabledTypes: ["working", "episodic"], userId: "u1" });
    await mgr.addMemory({
      content: "low importance",
      memoryType: "working",
      importance: 0.3,
      userId: "u1",
    });
    const moved = await mgr.consolidateMemories({
      fromType: "working",
      toType: "episodic",
      importanceThreshold: 0.8,
    });
    expect(moved).toBe(0);
  });
});

describe("MemoryManager — clearAllMemories", () => {
  it("clears all enabled memory stores", async () => {
    const mgr = new MemoryManager({ enabledTypes: ["working", "episodic"], userId: "u1" });
    await mgr.addMemory({ content: "something", memoryType: "working", userId: "u1" });
    await mgr.clearAllMemories();
    const results = await mgr.retrieveMemories({ query: "something", limit: 10 });
    expect(results).toHaveLength(0);
  });
});

describe("MemoryManager — getMemoryStats", () => {
  it("returns stats with totalMemories", async () => {
    const mgr = new MemoryManager({ enabledTypes: ["working", "episodic"], userId: "u1" });
    await mgr.addMemory({ content: "test", memoryType: "working", userId: "u1" });
    const stats = await mgr.getMemoryStats();
    expect(typeof stats.totalMemories).toBe("number");
    expect(stats.totalMemories).toBeGreaterThanOrEqual(1);
  });

  it("returns 0 for empty manager", async () => {
    const mgr = new MemoryManager({ enabledTypes: ["working"], userId: "u1" });
    const stats = await mgr.getMemoryStats();
    expect(stats.totalMemories).toBe(0);
  });
});
