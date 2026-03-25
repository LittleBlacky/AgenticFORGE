/**
 * @agenticforge/agents — 扩展单元测试 Part 2
 * 覆盖：ReflectionAgent, SkillAgent, WorkflowAgent
 */
import { describe, it, expect, vi } from "vitest";
import { ReflectionAgent } from "../../packages/agents/src/reflection-agent/ReflectionAgent";
import { SkillAgent } from "../../packages/agents/src/skill-agent/SkillAgent";
import { WorkflowAgent } from "../../packages/agents/src/workflow-agent/WorkflowAgent";
import { AgentSkill } from "@agenticforge/skills";
import { Tool, ToolRegistry } from "@agenticforge/tools";
import type { ToolParameter } from "@agenticforge/tools";
import type { WorkflowDefinition } from "@agenticforge/workflow";

function makeMockLLM(response = "agent-response") {
  return {
    think: vi.fn().mockResolvedValue(response),
    streamThink: vi.fn(async function* () { yield response; }),
    client: { chat: { completions: { create: vi.fn() } } },
    model: "mock-model",
  } as any;
}

class EchoTool extends Tool {
  constructor() { super("echo", "Echoes input"); }
  getParameters(): ToolParameter[] {
    return [{ name: "input", type: "string", description: "text", required: true, default: null }];
  }
  async run(p: Record<string, unknown>) { return String(p.input ?? ""); }
}

// ===========================================================================
// ReflectionAgent
// ===========================================================================
describe("ReflectionAgent", () => {
  it("run() returns revised answer after reflection rounds", async () => {
    let call = 0;
    const llm = {
      ...makeMockLLM(),
      think: vi.fn().mockImplementation(async () => {
        call++;
        if (call === 1) return "draft answer";
        if (call === 2) return "critique: needs improvement";
        return "revised answer";
      }),
      streamThink: vi.fn(async function* () { yield "revised answer"; }),
    } as any;
    const agent = new ReflectionAgent({ name: "reflect", llm, maxRounds: 1 });
    const result = await agent.run("Write something");
    expect(result).toBe("revised answer");
  });

  it("run() adds to history", async () => {
    let call = 0;
    const llm = {
      ...makeMockLLM(),
      think: vi.fn().mockImplementation(async () => {
        call++; if (call === 1) return "draft"; if (call === 2) return "critique"; return "revised";
      }),
      streamThink: vi.fn(async function* () { yield "revised"; }),
    } as any;
    const agent = new ReflectionAgent({ name: "reflect", llm, maxRounds: 1 });
    await agent.run("q");
    expect(agent.getHistory().some(m => m.role === "assistant")).toBe(true);
  });

  it("memory records all rounds", async () => {
    let call = 0;
    const llm = {
      ...makeMockLLM(),
      think: vi.fn().mockImplementation(async () => {
        call++; if (call === 1) return "draft"; if (call === 2) return "critique"; return "revised";
      }),
      streamThink: vi.fn(async function* () { yield "revised"; }),
    } as any;
    const agent = new ReflectionAgent({ name: "reflect", llm, maxRounds: 1 });
    await agent.run("q");
    expect(agent.memory.getAll().length).toBe(1);
  });

  it("streamRun() yields tokens", async () => {
    let call = 0;
    const llm = {
      ...makeMockLLM(),
      think: vi.fn().mockImplementation(async () => { call++; return call === 1 ? "draft" : "critique"; }),
      streamThink: vi.fn(async function* () { yield "streamed revision"; }),
    } as any;
    const agent = new ReflectionAgent({ name: "reflect", llm, maxRounds: 1 });
    const chunks: string[] = [];
    for await (const c of agent.streamRun("q")) chunks.push(c);
    expect(chunks.join("")).toBe("streamed revision");
  });

  it("uses default maxRounds of 2 (5 LLM calls total)", async () => {
    const thinkMock = vi.fn().mockResolvedValue("response");
    const llm = { ...makeMockLLM(), think: thinkMock, streamThink: vi.fn(async function* () { yield "r"; }) } as any;
    const agent = new ReflectionAgent({ name: "reflect", llm });
    await agent.run("q");
    expect(thinkMock).toHaveBeenCalledTimes(5);
  });
});

// ===========================================================================
// SkillAgent
// ===========================================================================
describe("SkillAgent", () => {
  it("run() routes to single visible skill", async () => {
    const llm = makeMockLLM("skill-output");
    const skill = new AgentSkill({ name: "weather", description: "Get weather" });
    const agent = new SkillAgent({ name: "sa", llm, skills: [skill] });
    const result = await agent.run("Tokyo weather?");
    expect(result).toBe("skill-output");
  });

  it("runSkill() by name returns SkillResult", async () => {
    const llm = makeMockLLM("named-output");
    const skill = new AgentSkill({ name: "stock", description: "Stock prices" });
    const agent = new SkillAgent({ name: "sa", llm, skills: [skill] });
    const result = await agent.runSkill("stock", "AAPL?");
    expect(result.output).toBe("named-output");
  });

  it("runSkill() throws for unknown skill", async () => {
    const agent = new SkillAgent({ name: "sa", llm: makeMockLLM(), skills: [] });
    await expect(agent.runSkill("nope", "q")).rejects.toThrow("nope");
  });

  it("run() falls back to LLM when no skills registered", async () => {
    const llm = makeMockLLM("fallback");
    const agent = new SkillAgent({ name: "sa", llm, skills: [] });
    const result = await agent.run("q");
    expect(result).toBe("fallback");
  });

  it("addSkill() / removeSkill() / listSkills()", () => {
    const agent = new SkillAgent({ name: "sa", llm: makeMockLLM(), skills: [] });
    agent.addSkill(new AgentSkill({ name: "s", description: "d" }));
    expect(agent.listSkills()).toContain("s");
    agent.removeSkill("s");
    expect(agent.listSkills()).not.toContain("s");
  });

  it("run() routes via LLM when multiple skills present", async () => {
    const thinkMock = vi.fn()
      .mockResolvedValueOnce("weather")
      .mockResolvedValueOnce("rainy");
    const llm = { ...makeMockLLM(), think: thinkMock, streamThink: vi.fn(async function* () { yield "r"; }) } as any;
    const agent = new SkillAgent({ name: "sa", llm, skills: [
      new AgentSkill({ name: "weather", description: "weather skill" }),
      new AgentSkill({ name: "stock",   description: "stock skill" }),
    ]});
    const result = await agent.run("Is it raining?");
    expect(result).toBe("rainy");
  });

  it("streamRun() yields tokens", async () => {
    const llm = makeMockLLM("stream-output");
    const skill = new AgentSkill({ name: "s", description: "d" });
    const agent = new SkillAgent({ name: "sa", llm, skills: [skill] });
    const chunks: string[] = [];
    for await (const c of agent.streamRun("q")) chunks.push(c);
    expect(chunks.join("")).toBe("stream-output");
  });
});

// ===========================================================================
// WorkflowAgent
// ===========================================================================
describe("WorkflowAgent", () => {
  const fnWorkflow: WorkflowDefinition = {
    name: "test",
    nodes: [{ id: "a", type: "fn", executor: async () => "fn-result", depends: [] }],
  };

  it("runWorkflow() returns WorkflowResult", async () => {
    const agent = new WorkflowAgent({ name: "wa", llm: makeMockLLM() });
    const result = await agent.runWorkflow(fnWorkflow, "input");
    expect(result.output).toBe("fn-result");
    expect(result.nodeResults).toHaveLength(1);
  });

  it("setWorkflow() + run() executes preset workflow", async () => {
    const agent = new WorkflowAgent({ name: "wa", llm: makeMockLLM() });
    agent.setWorkflow(fnWorkflow);
    const result = await agent.run("input");
    expect(result).toBe("fn-result");
  });

  it("run() without setWorkflow() throws", async () => {
    const agent = new WorkflowAgent({ name: "wa", llm: makeMockLLM() });
    await expect(agent.run("input")).rejects.toThrow("setWorkflow");
  });

  it("runWorkflow() adds messages to history", async () => {
    const agent = new WorkflowAgent({ name: "wa", llm: makeMockLLM() });
    await agent.runWorkflow(fnWorkflow, "hello");
    expect(agent.getHistory().some(m => m.role === "user" && m.content === "hello")).toBe(true);
    expect(agent.getHistory().some(m => m.role === "assistant")).toBe(true);
  });

  it("runWorkflow() with llm node calls llm.think", async () => {
    const llm = makeMockLLM("llm-output");
    const agent = new WorkflowAgent({ name: "wa", llm });
    const def: WorkflowDefinition = {
      name: "llm-test",
      nodes: [{ id: "n", type: "llm", promptTemplate: "Answer: {input}", depends: [] }],
    };
    const result = await agent.runWorkflow(def, "hi");
    expect(result.output).toBe("llm-output");
    expect(llm.think).toHaveBeenCalled();
  });

  it("runWorkflow() with tool node uses ToolRegistry", async () => {
    const registry = new ToolRegistry();
    registry.registerTool(new EchoTool());
    const agent = new WorkflowAgent({ name: "wa", llm: makeMockLLM(), registry });
    const def: WorkflowDefinition = {
      name: "tool-test",
      nodes: [{ id: "t", type: "tool", toolName: "echo", inputTemplate: "{input}", depends: [] }],
    };
    const result = await agent.runWorkflow(def, "hello");
    expect(result.output).toBe("hello");
  });
});
