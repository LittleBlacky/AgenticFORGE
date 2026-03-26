/**
 * @agenticforge/agents — 扩展单元测试
 * 覆盖：ReActAgent, PlanSolveAgent, ReflectionAgent, SkillAgent, WorkflowAgent
 */
import { describe, it, expect, vi } from "vitest";
import { ReActAgent } from "../../packages/agents/src/react-agent/ReActAgent";
import { PlanSolveAgent } from "../../packages/agents/src/plan-solve-agent/PlanSolveAgent";
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
    streamThink: vi.fn(async function* () {
      yield response;
    }),
    client: { chat: { completions: { create: vi.fn() } } },
    model: "mock-model",
  } as any;
}

class EchoTool extends Tool {
  constructor() {
    super("echo", "Echoes input");
  }
  getParameters(): ToolParameter[] {
    return [{ name: "input", type: "string", description: "text", required: true, default: null }];
  }
  async run(p: Record<string, unknown>) {
    return String(p.input ?? "");
  }
}

// ===========================================================================
// ReActAgent
// ===========================================================================
describe("ReActAgent", () => {
  it("run() returns Final Answer when LLM produces one", async () => {
    const llm = makeMockLLM("Final Answer: 42");
    const agent = new ReActAgent({ name: "react", llm });
    const result = await agent.run("What is 6*7?");
    expect(result).toBe("42");
  });

  it("run() returns raw response when no Final Answer pattern", async () => {
    const llm = makeMockLLM("just a plain response");
    const agent = new ReActAgent({ name: "react", llm });
    const result = await agent.run("hello");
    expect(result).toBe("just a plain response");
  });

  it("run() uses tool when Action pattern found", async () => {
    let call = 0;
    const llm = {
      ...makeMockLLM(),
      think: vi.fn().mockImplementation(async () => {
        call++;
        if (call === 1) return "Thought: need echo\nAction: echo\nAction Input: hello";
        return "Final Answer: echoed";
      }),
      streamThink: vi.fn(async function* () {
        yield "echoed";
      }),
    } as any;
    const registry = new ToolRegistry();
    registry.registerTool(new EchoTool());
    const agent = new ReActAgent({ name: "react", llm, toolRegistry: registry, maxSteps: 5 });
    const result = await agent.run("echo hello");
    expect(result).toBe("echoed");
  });

  it("getSteps() returns steps recorded during run", async () => {
    const llm = makeMockLLM("Final Answer: done");
    const agent = new ReActAgent({ name: "react", llm });
    await agent.run("go");
    expect(agent.getSteps().length).toBeGreaterThan(0);
  });

  it("run() adds messages to history", async () => {
    const llm = makeMockLLM("Final Answer: ok");
    const agent = new ReActAgent({ name: "react", llm });
    await agent.run("q");
    expect(agent.getHistory().some((m) => m.role === "user")).toBe(true);
    expect(agent.getHistory().some((m) => m.role === "assistant")).toBe(true);
  });

  it("run() exhausts maxSteps and returns fallback", async () => {
    const llm = {
      ...makeMockLLM("Thought: thinking\nAction: echo\nAction Input: x"),
      streamThink: vi.fn(async function* () {
        yield "x";
      }),
    } as any;
    const registry = new ToolRegistry();
    registry.registerTool(new EchoTool());
    const agent = new ReActAgent({ name: "react", llm, toolRegistry: registry, maxSteps: 2 });
    const result = await agent.run("loop forever");
    expect(typeof result).toBe("string");
  });

  it("streamRun() yields tokens", async () => {
    const llm = {
      ...makeMockLLM("Final Answer: streamed"),
      streamThink: vi.fn(async function* () {
        yield "streamed";
      }),
    } as any;
    const agent = new ReActAgent({ name: "react", llm });
    const chunks: string[] = [];
    for await (const c of agent.streamRun("q")) chunks.push(c);
    expect(chunks.join("").length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// PlanSolveAgent
// ===========================================================================
describe("PlanSolveAgent", () => {
  it("run() returns final answer string", async () => {
    const planJson = JSON.stringify({ steps: [{ id: 1, description: "Research" }] });
    let call = 0;
    const llm = {
      ...makeMockLLM(),
      think: vi.fn().mockImplementation(async () => {
        call++;
        if (call === 1) return planJson;
        if (call === 2) return "step result";
        return "final answer";
      }),
      streamThink: vi.fn(async function* () {
        yield "final answer";
      }),
    } as any;
    const agent = new PlanSolveAgent({ name: "ps", llm });
    const result = await agent.run("Research AI");
    expect(result).toBe("final answer");
  });

  it("getLastPlan() returns plan after run", async () => {
    const planJson = JSON.stringify({ steps: [{ id: 1, description: "Step one" }] });
    let call = 0;
    const llm = {
      ...makeMockLLM(),
      think: vi.fn().mockImplementation(async () => {
        call++;
        return call === 1 ? planJson : "result";
      }),
      streamThink: vi.fn(async function* () {
        yield "result";
      }),
    } as any;
    const agent = new PlanSolveAgent({ name: "ps", llm });
    await agent.run("goal");
    expect(agent.getLastPlan()).toBeDefined();
    expect(agent.getLastPlan()!.steps.length).toBe(1);
  });

  it("run() handles malformed plan JSON gracefully", async () => {
    let call = 0;
    const llm = {
      ...makeMockLLM(),
      think: vi.fn().mockImplementation(async () => {
        call++;
        return call === 1 ? "not json" : "final";
      }),
      streamThink: vi.fn(async function* () {
        yield "final";
      }),
    } as any;
    const agent = new PlanSolveAgent({ name: "ps", llm });
    const result = await agent.run("goal");
    expect(typeof result).toBe("string");
  });

  it("streamRun() yields tokens", async () => {
    const planJson = JSON.stringify({ steps: [{ id: 1, description: "Step" }] });
    let call = 0;
    const llm = {
      ...makeMockLLM(),
      think: vi.fn().mockImplementation(async () => {
        call++;
        return call === 1 ? planJson : "step result";
      }),
      streamThink: vi.fn(async function* () {
        yield "streamed answer";
      }),
    } as any;
    const agent = new PlanSolveAgent({ name: "ps", llm });
    const chunks: string[] = [];
    for await (const c of agent.streamRun("goal")) chunks.push(c);
    expect(chunks.join("")).toBe("streamed answer");
  });
});
