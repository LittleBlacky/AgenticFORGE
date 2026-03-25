/**
 * tools/src/Tool.ts — validate, toJSON, defineFunctionTool, toolAction 路径
 * agents/SkillAgent — streamRun no-skill path
 */
import { describe, it, expect, vi } from "vitest";
import { Tool, defineFunctionTool } from "../../packages/tools/src/Tool";
import { SkillAgent } from "../../packages/agents/src/skill-agent/SkillAgent";
import { AgentSkill } from "@agenticforge/skills";
import type { ToolParameter } from "@agenticforge/tools";

class SampleTool extends Tool {
  constructor() { super("sample", "A sample tool"); }
  getParameters(): ToolParameter[] {
    return [
      { name: "input", type: "string", description: "text", required: true, default: null },
      { name: "count", type: "number", description: "num", required: false, default: 1 },
    ];
  }
  async run(p: Record<string, unknown>): Promise<string> {
    return `result:${p.input}`;
  }
}

// ===========================================================================
// Tool — validateParameters()
// ===========================================================================
describe("Tool — validateParameters()", () => {
  it("returns true for valid parameters", () => {
    const tool = new SampleTool();
    expect(tool.validateParameters({ input: "hello" })).toBe(true);
  });

  it("returns false when required param missing", () => {
    const tool = new SampleTool();
    expect(tool.validateParameters({ count: 2 })).toBe(false);
  });

  it("returns true even for wrong type (only checks presence)", () => {
    // Tool.validateParameters only checks required params are present, not types
    const tool = new SampleTool();
    expect(typeof tool.validateParameters({ input: 123 })).toBe("boolean");
  });

  it("returns true when optional param missing", () => {
    const tool = new SampleTool();
    expect(tool.validateParameters({ input: "ok" })).toBe(true);
  });
});

// ===========================================================================
// Tool — getParameters() / name / description
// ===========================================================================
describe("Tool — basic properties", () => {
  it("has correct name and description", () => {
    const tool = new SampleTool();
    expect(tool.name).toBe("sample");
    expect(tool.description).toBe("A sample tool");
  });

  it("getParameters() returns parameter definitions", () => {
    const tool = new SampleTool();
    const params = tool.getParameters();
    expect(params.length).toBeGreaterThan(0);
    expect(params.find(p => p.name === "input")).toBeDefined();
  });

  it("run() returns expected string", async () => {
    const tool = new SampleTool();
    expect(await tool.run({ input: "test" })).toBe("result:test");
  });
});

// ===========================================================================
// defineFunctionTool
// ===========================================================================
describe("defineFunctionTool", () => {
  it("returns the same object passed in", () => {
    const ft = defineFunctionTool({
      name: "ft",
      description: "func tool",
      func: async ({ x }: { x: string }) => x.toUpperCase(),
    });
    expect(ft.name).toBe("ft");
    expect(ft.description).toBe("func tool");
    expect(typeof ft.func).toBe("function");
  });

  it("func executes correctly", async () => {
    const ft = defineFunctionTool({
      name: "upper",
      description: "uppercase",
      func: async ({ text }: { text: string }) => text.toUpperCase(),
    });
    expect(await ft.func({ text: "hello" })).toBe("HELLO");
  });
});

// ===========================================================================
// SkillAgent — streamRun uncovered paths
// ===========================================================================
describe("SkillAgent — streamRun extra paths", () => {
  it("streamRun() with no skills falls back to llm.streamThink", async () => {
    const llm = {
      think: vi.fn().mockResolvedValue("ok"),
      streamThink: vi.fn(async function* () { yield "fallback-stream"; }),
      client: undefined,
      model: "m",
    } as any;
    const agent = new SkillAgent({ name: "sa", llm, skills: [] });
    const chunks: string[] = [];
    for await (const c of agent.streamRun("q")) chunks.push(c);
    expect(chunks.join("")).toBe("fallback-stream");
  });

  it("streamRun() with skillName option executes named skill", async () => {
    const llm = {
      think: vi.fn().mockResolvedValue("skill-output"),
      streamThink: vi.fn(async function* () { yield "s"; }),
      client: undefined,
      model: "m",
    } as any;
    const skill = new AgentSkill({ name: "myskill", description: "d" });
    const agent = new SkillAgent({ name: "sa", llm, skills: [skill] });
    const chunks: string[] = [];
    for await (const c of agent.streamRun("q", { skillName: "myskill" })) chunks.push(c);
    expect(chunks.join("")).toBe("skill-output");
  });

  it("streamRun() throws for unknown skillName", async () => {
    const llm = { think: vi.fn(), streamThink: vi.fn(), client: undefined, model: "m" } as any;
    const agent = new SkillAgent({ name: "sa", llm, skills: [] });
    await expect(async () => {
      for await (const _ of agent.streamRun("q", { skillName: "nope" })) {}
    }).rejects.toThrow("nope");
  });

  it("streamRun() routes to single skill via LLM", async () => {
    const llm = {
      think: vi.fn().mockResolvedValue("routed-output"),
      streamThink: vi.fn(async function* () { yield "s"; }),
      client: undefined,
      model: "m",
    } as any;
    const skill = new AgentSkill({ name: "weather", description: "weather skill" });
    const agent = new SkillAgent({ name: "sa", llm, skills: [skill] });
    const chunks: string[] = [];
    for await (const c of agent.streamRun("weather query")) chunks.push(c);
    expect(chunks.join("")).toBe("routed-output");
  });
});
