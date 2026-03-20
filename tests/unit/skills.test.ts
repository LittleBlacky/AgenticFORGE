/**
 * @agenticforge/skills — 单元测试
 * 覆盖：AgentSkill, SkillRegistry, SkillRunner
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentSkill } from "../../packages/skills/src/AgentSkill";
import { SkillRegistry } from "../../packages/skills/src/SkillRegistry";
import { SkillRunner } from "../../packages/skills/src/SkillRunner";
import type { SkillContext, SkillResult } from "../../packages/skills/src/types";

function makeMockLLM(response = "skill-output") {
  return {
    think: vi.fn().mockResolvedValue(response),
    streamThink: vi.fn(),
    client: undefined,
    model: "mock",
  } as any;
}

// ===========================================================================
// AgentSkill
// ===========================================================================
describe("AgentSkill", () => {
  it("constructs with required fields", () => {
    const skill = new AgentSkill({ name: "weather", description: "Get weather" });
    expect(skill.name).toBe("weather");
    expect(skill.description).toBe("Get weather");
    expect(skill.visible).toBe(true);
  });

  it("visible defaults to true", () => {
    const skill = new AgentSkill({ name: "s", description: "d" });
    expect(skill.visible).toBe(true);
  });

  it("visible can be set to false", () => {
    const skill = new AgentSkill({ name: "s", description: "d", visible: false });
    expect(skill.visible).toBe(false);
  });

  it("execute() without tools calls llm.think", async () => {
    const llm = makeMockLLM("answer");
    const skill = new AgentSkill({ name: "s", description: "d", systemPrompt: "Be helpful." });
    const ctx: SkillContext = { query: "What is AI?" };
    const result = await skill.execute(ctx, llm);
    expect(result.output).toBe("answer");
    expect(llm.think).toHaveBeenCalledOnce();
  });

  it("execute() passes systemPrompt as first message", async () => {
    const llm = makeMockLLM("ok");
    const skill = new AgentSkill({ name: "s", description: "d", systemPrompt: "Custom prompt." });
    await skill.execute({ query: "q" }, llm);
    const msgs = llm.think.mock.calls[0][0] as Array<{ role: string; content: string }>;
    expect(msgs[0]!.role).toBe("system");
    expect(msgs[0]!.content).toBe("Custom prompt.");
  });

  it("execute() includes conversation history", async () => {
    const llm = makeMockLLM("ok");
    const skill = new AgentSkill({ name: "s", description: "d" });
    const ctx: SkillContext = {
      query: "follow-up",
      history: [{ role: "user", content: "prev" }, { role: "assistant", content: "prev-reply" }],
    };
    await skill.execute(ctx, llm);
    const msgs = llm.think.mock.calls[0][0] as Array<{ role: string; content: string }>;
    expect(msgs.some(m => m.content === "prev")).toBe(true);
  });

  it("describe() returns markdown bullet with name and description", () => {
    const skill = new AgentSkill({ name: "stock", description: "Get stock price", triggerHint: "When user asks about stocks" });
    const desc = skill.describe();
    expect(desc).toContain("stock");
    expect(desc).toContain("Get stock price");
    expect(desc).toContain("When user asks about stocks");
  });

  it("tools array defaults to empty", () => {
    const skill = new AgentSkill({ name: "s", description: "d" });
    expect(skill.tools).toHaveLength(0);
  });
});

// ===========================================================================
// SkillRegistry
// ===========================================================================
describe("SkillRegistry", () => {
  let registry: SkillRegistry;

  beforeEach(() => {
    registry = new SkillRegistry();
  });

  it("register / get roundtrip", () => {
    const skill = new AgentSkill({ name: "s", description: "d" });
    registry.register(skill);
    expect(registry.get("s")).toBe(skill);
  });

  it("has() true after register", () => {
    registry.register(new AgentSkill({ name: "s", description: "d" }));
    expect(registry.has("s")).toBe(true);
  });

  it("has() false for unregistered", () => {
    expect(registry.has("nope")).toBe(false);
  });

  it("unregister() removes skill", () => {
    registry.register(new AgentSkill({ name: "s", description: "d" }));
    expect(registry.unregister("s")).toBe(true);
    expect(registry.has("s")).toBe(false);
  });

  it("unregister() returns false for unknown", () => {
    expect(registry.unregister("nope")).toBe(false);
  });

  it("list() returns all skill names", () => {
    registry.register(new AgentSkill({ name: "a", description: "A" }));
    registry.register(new AgentSkill({ name: "b", description: "B" }));
    expect(registry.list()).toEqual(expect.arrayContaining(["a", "b"]));
  });

  it("all() returns all skill instances", () => {
    registry.register(new AgentSkill({ name: "a", description: "A" }));
    registry.register(new AgentSkill({ name: "b", description: "B" }));
    expect(registry.all()).toHaveLength(2);
  });

  it("visible() excludes hidden skills", () => {
    registry.register(new AgentSkill({ name: "visible", description: "v", visible: true }));
    registry.register(new AgentSkill({ name: "hidden", description: "h", visible: false }));
    const v = registry.visible();
    expect(v.some(s => s.name === "visible")).toBe(true);
    expect(v.some(s => s.name === "hidden")).toBe(false);
  });

  it("size() returns count", () => {
    registry.register(new AgentSkill({ name: "a", description: "A" }));
    expect(registry.size()).toBe(1);
  });

  it("describeAll() returns markdown list", () => {
    registry.register(new AgentSkill({ name: "weather", description: "Get weather" }));
    const desc = registry.describeAll();
    expect(desc).toContain("weather");
  });

  it("describeAll() returns placeholder when empty", () => {
    expect(registry.describeAll()).toContain("暂无");
  });
});

// ===========================================================================
// SkillRunner
// ===========================================================================
describe("SkillRunner", () => {
  it("run() executes the only registered skill", async () => {
    const llm = makeMockLLM("skill-result");
    const skill = new AgentSkill({ name: "echo", description: "Echo" });
    const runner = new SkillRunner({ llm, skills: [skill] });
    const result = await runner.run("hello");
    expect(result.output).toBe("skill-result");
  });

  it("runSkill() by name executes specified skill", async () => {
    const llm = makeMockLLM("named-result");
    const skill = new AgentSkill({ name: "myskill", description: "My skill" });
    const runner = new SkillRunner({ llm, skills: [skill] });
    const result = await runner.runSkill("myskill", "query");
    expect(result.output).toBe("named-result");
  });

  it("runSkill() throws for unknown skill", async () => {
    const runner = new SkillRunner({ llm: makeMockLLM(), skills: [] });
    await expect(runner.runSkill("nope", "q")).rejects.toThrow("nope");
  });

  it("run() falls back to LLM when no skills registered", async () => {
    const llm = makeMockLLM("fallback");
    const runner = new SkillRunner({ llm, skills: [] });
    const result = await runner.run("question");
    expect(result.output).toBe("fallback");
  });

  it("addSkill() / removeSkill() management", () => {
    const runner = new SkillRunner({ llm: makeMockLLM(), skills: [] });
    runner.addSkill(new AgentSkill({ name: "s", description: "d" }));
    expect(runner.listSkills()).toContain("s");
    runner.removeSkill("s");
    expect(runner.listSkills()).not.toContain("s");
  });

  it("listSkills() returns registered skill names", () => {
    const runner = new SkillRunner({
      llm: makeMockLLM(),
      skills: [
        new AgentSkill({ name: "a", description: "A" }),
        new AgentSkill({ name: "b", description: "B" }),
      ],
    });
    expect(runner.listSkills()).toEqual(expect.arrayContaining(["a", "b"]));
  });
});
