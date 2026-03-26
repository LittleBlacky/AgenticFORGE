/**
 * agents/plan-solve-agent — Plan, Executor, ReflectionMemory
 */
import { describe, it, expect, vi } from "vitest";
import {
  createPlan,
  markStepDone,
  markStepFailed,
  getPendingSteps,
  getCompletedResults,
} from "../../packages/agents/src/plan-solve-agent/Plan";
import { StepExecutor } from "../../packages/agents/src/plan-solve-agent/Executor";
import { ReflectionMemory } from "../../packages/agents/src/reflection-agent/Memory";
import { Tool, ToolRegistry } from "@agenticforge/tools";
import type { ToolParameter } from "@agenticforge/tools";

function makeLLM(response = "result") {
  return {
    think: vi.fn().mockResolvedValue(response),
    streamThink: vi.fn(),
    client: {},
    model: "m",
  } as any;
}

class EchoTool extends Tool {
  constructor() {
    super("echo", "Echoes");
  }
  getParameters(): ToolParameter[] {
    return [{ name: "input", type: "string", description: "t", required: true, default: null }];
  }
  async run(p: Record<string, unknown>) {
    return String(p.input ?? "");
  }
}

// ===========================================================================
// Plan functions
// ===========================================================================
describe("createPlan", () => {
  it("creates plan with pending steps", () => {
    const plan = createPlan("goal", [
      { id: 1, description: "step1" },
      { id: 2, description: "step2" },
    ]);
    expect(plan.goal).toBe("goal");
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps.every((s) => s.status === "pending")).toBe(true);
  });
  it("creates plan with empty steps", () => {
    const plan = createPlan("goal", []);
    expect(plan.steps).toHaveLength(0);
  });
  it("preserves step tool field", () => {
    const plan = createPlan("g", [{ id: 1, description: "d", tool: "echo" }]);
    expect(plan.steps[0]!.tool).toBe("echo");
  });
  it("createdAt is a Date", () => {
    expect(createPlan("g", []).createdAt).toBeInstanceOf(Date);
  });
});

describe("markStepDone", () => {
  it("sets status to done and records result", () => {
    const plan = createPlan("g", [{ id: 1, description: "d" }]);
    markStepDone(plan, 1, "ok");
    expect(plan.steps[0]!.status).toBe("done");
    expect(plan.steps[0]!.result).toBe("ok");
  });
  it("does nothing for unknown step id", () => {
    const plan = createPlan("g", [{ id: 1, description: "d" }]);
    markStepDone(plan, 99, "x");
    expect(plan.steps[0]!.status).toBe("pending");
  });
});

describe("markStepFailed", () => {
  it("sets status to failed and records error", () => {
    const plan = createPlan("g", [{ id: 1, description: "d" }]);
    markStepFailed(plan, 1, "err");
    expect(plan.steps[0]!.status).toBe("failed");
    expect(plan.steps[0]!.result).toBe("err");
  });
  it("does nothing for unknown step id", () => {
    const plan = createPlan("g", [{ id: 1, description: "d" }]);
    markStepFailed(plan, 99, "x");
    expect(plan.steps[0]!.status).toBe("pending");
  });
});

describe("getPendingSteps", () => {
  it("returns only pending steps", () => {
    const plan = createPlan("g", [
      { id: 1, description: "a" },
      { id: 2, description: "b" },
    ]);
    markStepDone(plan, 1, "done");
    expect(getPendingSteps(plan)).toHaveLength(1);
    expect(getPendingSteps(plan)[0]!.id).toBe(2);
  });
  it("returns all steps when none completed", () => {
    const plan = createPlan("g", [
      { id: 1, description: "a" },
      { id: 2, description: "b" },
    ]);
    expect(getPendingSteps(plan)).toHaveLength(2);
  });
});

describe("getCompletedResults", () => {
  it("returns results of done steps", () => {
    const plan = createPlan("g", [
      { id: 1, description: "a" },
      { id: 2, description: "b" },
    ]);
    markStepDone(plan, 1, "result-a");
    markStepFailed(plan, 2, "fail");
    expect(getCompletedResults(plan)).toEqual(["result-a"]);
  });
  it("returns empty array when no done steps", () => {
    const plan = createPlan("g", [{ id: 1, description: "a" }]);
    expect(getCompletedResults(plan)).toHaveLength(0);
  });
});

// ===========================================================================
// StepExecutor
// ===========================================================================
describe("StepExecutor", () => {
  it("execute() calls llm.think when no tool", async () => {
    const llm = makeLLM("step-result");
    const executor = new StepExecutor({ llm });
    const step = { id: 1, description: "Do something", status: "pending" as const };
    const result = await executor.execute(step);
    expect(result).toBe("step-result");
    expect(llm.think).toHaveBeenCalledOnce();
  });

  it("execute() uses tool when step.tool matches registry", async () => {
    const llm = makeLLM();
    const registry = new ToolRegistry();
    registry.registerTool(new EchoTool());
    const executor = new StepExecutor({ llm, toolRegistry: registry });
    const step = { id: 1, description: "echo this", tool: "echo", status: "pending" as const };
    const result = await executor.execute(step, "");
    expect(result).toBe("echo this");
    expect(llm.think).not.toHaveBeenCalled();
  });

  it("execute() falls back to llm when tool not in registry", async () => {
    const llm = makeLLM("fallback");
    const registry = new ToolRegistry();
    const executor = new StepExecutor({ llm, toolRegistry: registry });
    const step = {
      id: 1,
      description: "use missing-tool",
      tool: "missing-tool",
      status: "pending" as const,
    };
    const result = await executor.execute(step);
    expect(result).toBe("fallback");
  });

  it("execute() catches tool error and returns error message", async () => {
    const badTool = new (class extends Tool {
      constructor() {
        super("bad", "throws");
      }
      getParameters(): ToolParameter[] {
        return [];
      }
      async run(): Promise<string> {
        throw new Error("tool failed");
      }
    })();
    const registry = new ToolRegistry();
    registry.registerTool(badTool);
    const executor = new StepExecutor({ llm: makeLLM(), toolRegistry: registry });
    const step = { id: 1, description: "fail", tool: "bad", status: "pending" as const };
    const result = await executor.execute(step);
    expect(result).toContain("tool failed");
  });

  it("execute() passes context to llm prompt", async () => {
    const llm = makeLLM("ok");
    const executor = new StepExecutor({ llm });
    const step = { id: 1, description: "step desc", status: "pending" as const };
    await executor.execute(step, "previous context");
    const prompt = llm.think.mock.calls[0][0];
    const hasContext = JSON.stringify(prompt).includes("previous context");
    expect(hasContext).toBe(true);
  });
});

// ===========================================================================
// ReflectionMemory
// ===========================================================================
describe("ReflectionMemory", () => {
  it("add() stores entry and getAll() returns it", () => {
    const mem = new ReflectionMemory();
    mem.add({ draft: "d", critique: "c", revision: "r", round: 1 });
    expect(mem.getAll()).toHaveLength(1);
    expect(mem.getAll()[0]!.draft).toBe("d");
  });
  it("getAll() returns copy (mutation safe)", () => {
    const mem = new ReflectionMemory();
    mem.add({ draft: "d", critique: "c", revision: "r", round: 1 });
    const all = mem.getAll();
    all.push({ draft: "x", critique: "x", revision: "x", round: 2, timestamp: new Date() });
    expect(mem.size()).toBe(1);
  });
  it("getLast() returns last entry", () => {
    const mem = new ReflectionMemory();
    mem.add({ draft: "d1", critique: "c1", revision: "r1", round: 1 });
    mem.add({ draft: "d2", critique: "c2", revision: "r2", round: 2 });
    expect(mem.getLast()!.round).toBe(2);
  });
  it("getLast() returns undefined when empty", () => {
    expect(new ReflectionMemory().getLast()).toBeUndefined();
  });
  it("size() returns correct count", () => {
    const mem = new ReflectionMemory();
    mem.add({ draft: "d", critique: "c", revision: "r", round: 1 });
    expect(mem.size()).toBe(1);
  });
  it("clear() removes all entries", () => {
    const mem = new ReflectionMemory();
    mem.add({ draft: "d", critique: "c", revision: "r", round: 1 });
    mem.clear();
    expect(mem.size()).toBe(0);
    expect(mem.getAll()).toHaveLength(0);
  });
  it("add() includes timestamp", () => {
    const mem = new ReflectionMemory();
    mem.add({ draft: "d", critique: "c", revision: "r", round: 1 });
    expect(mem.getAll()[0]!.timestamp).toBeInstanceOf(Date);
  });
});
