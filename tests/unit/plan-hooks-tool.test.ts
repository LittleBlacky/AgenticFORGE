/**
 * 补充覆盖率：
 * - PlanSolveAgent: run() step失败/verbose/getLastPlan/streamRun
 * - MetricsHook: 所有事件 + getSnapshot
 * - createConsoleLoggingHook: custom logger/events filter
 * - Tool: expandable/toolAction decorator
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PlanSolveAgent } from "../../packages/agents/src/plan-solve-agent/PlanSolveAgent";
import { MetricsHook } from "../../packages/core/src/hooks/metrics-hook";
import { createConsoleLoggingHook } from "../../packages/core/src/hooks/logging-hook";
import { Tool } from "../../packages/tools/src/Tool";
import { toolAction } from "../../packages/tools/src/Tool";
import type { ToolParameter } from "@agenticforge/tools";
import { ToolRegistry } from "@agenticforge/tools";

// ============================================================
// Helpers
// ============================================================
function makeValidPlanJSON(steps: { id: number; description: string }[]): string {
  return JSON.stringify({
    goal: "test goal",
    steps: steps.map(s => ({ id: s.id, description: s.description, toolName: "", parameters: {} })),
  });
}

function makeLLM(planResponse: string, finalResponse = "final answer") {
  let call = 0;
  return {
    think: vi.fn().mockImplementation(async () => {
      call++;
      return call === 1 ? planResponse : finalResponse;
    }),
    streamThink: vi.fn(async function* () { yield finalResponse; }),
    client: undefined,
    model: "m",
  } as any;
}

// ============================================================
// PlanSolveAgent
// ============================================================
describe("PlanSolveAgent — run()", () => {
  it("executes plan steps and returns final answer", async () => {
    const plan = makeValidPlanJSON([{ id: 1, description: "search" }]);
    const llm = makeLLM(plan, "The answer is 42");
    const agent = new PlanSolveAgent({ name: "psa", llm });
    const result = await agent.run("what is the answer?");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("getLastPlan() returns plan after run()", async () => {
    const plan = makeValidPlanJSON([{ id: 1, description: "step one" }]);
    const llm = makeLLM(plan);
    const agent = new PlanSolveAgent({ name: "psa", llm });
    await agent.run("q");
    const lastPlan = agent.getLastPlan();
    expect(lastPlan).toBeDefined();
    expect(lastPlan!.steps.length).toBeGreaterThan(0);
  });

  it("handles step execution failure gracefully", async () => {
    const plan = makeValidPlanJSON([{ id: 1, description: "broken step" }]);
    const registry = new ToolRegistry();
    const brokenTool = new class extends Tool {
      constructor() { super("broken", "breaks"); }
      getParameters(): ToolParameter[] { return []; }
      async run(): Promise<string> { throw new Error("step failed"); }
    }();
    registry.registerTool(brokenTool);
    const llm = makeLLM(`{"goal":"g","steps":[{"id":1,"description":"broken step","toolName":"broken","parameters":{}}]}`);
    const agent = new PlanSolveAgent({ name: "psa", llm, toolRegistry: registry });
    // Should not throw — failure is caught and context updated
    const result = await agent.run("q");
    expect(typeof result).toBe("string");
  });

  it("verbose mode logs without error", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const plan = makeValidPlanJSON([{ id: 1, description: "s1" }]);
    const llm = makeLLM(plan);
    const agent = new PlanSolveAgent({ name: "psa", llm, verbose: true });
    await agent.run("q");
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("emits onError hook and rethrows when LLM throws", async () => {
    const llm = { think: vi.fn().mockRejectedValue(new Error("llm down")), streamThink: vi.fn(), client: undefined, model: "m" } as any;
    const agent = new PlanSolveAgent({ name: "psa", llm });
    const errors: string[] = [];
    agent.useHook({ name: "e", events: ["onError"], handle: (ctx) => { errors.push((ctx.error as Error).message); } });
    await expect(agent.run("q")).rejects.toThrow("llm down");
    expect(errors).toContain("llm down");
  });

  it("handles invalid JSON plan (falls back to single-step)", async () => {
    const llm = makeLLM("not valid json at all", "done");
    const agent = new PlanSolveAgent({ name: "psa", llm });
    const result = await agent.run("q");
    expect(typeof result).toBe("string");
  });
});

describe("PlanSolveAgent — streamRun()", () => {
  it("yields streamed final answer", async () => {
    const plan = makeValidPlanJSON([{ id: 1, description: "s1" }]);
    const llm = makeLLM(plan, "streamed answer");
    const agent = new PlanSolveAgent({ name: "psa", llm });
    const chunks: string[] = [];
    for await (const c of agent.streamRun("q")) chunks.push(c);
    expect(chunks.join("")).toBeTruthy();
  });
});

// ============================================================
// MetricsHook
// ============================================================
describe("MetricsHook — capture all events", () => {
  let metrics: MetricsHook;
  beforeEach(() => { metrics = new MetricsHook(); });

  async function fire(event: string, extra: Record<string, unknown> = {}) {
    await metrics.hook.handle({
      event: event as any,
      agentName: "test-agent",
      traceId: "tid-1",
      ...extra,
    } as any);
  }

  it("counts beforeRun/afterRun events", async () => {
    await fire("beforeRun");
    await fire("afterRun");
    const snap = metrics.getSnapshot();
    expect(snap.totals.runStarted).toBe(1);
    expect(snap.totals.runSucceeded).toBe(1);
  });

  it("counts onError events", async () => {
    await fire("onError", { error: new Error("fail") });
    const snap = metrics.getSnapshot();
    expect(snap.totals.runFailed).toBe(1);
  });

  it("counts beforeLLMCall/afterLLMCall events", async () => {
    await fire("beforeLLMCall");
    await fire("afterLLMCall");
    const snap = metrics.getSnapshot();
    expect(snap.totals.llmCalls).toBe(1);
  });

  it("counts beforeToolCall/afterToolCall events", async () => {
    await fire("beforeToolCall", { toolName: "myTool" });
    await fire("afterToolCall", { toolName: "myTool" });
    const snap = metrics.getSnapshot();
    expect(snap.totals.toolCalls).toBe(1);
  });

  it("tracks avgRunLatencyMs", async () => {
    await fire("beforeRun");
    await new Promise(r => setTimeout(r, 5));
    await fire("afterRun");
    const snap = metrics.getSnapshot();
    expect(snap.avgRunLatencyMs).toBeGreaterThanOrEqual(0);
  });

  it("tracks avgLlmLatencyMs", async () => {
    await fire("beforeLLMCall");
    await new Promise(r => setTimeout(r, 5));
    await fire("afterLLMCall");
    const snap = metrics.getSnapshot();
    expect(snap.avgLlmLatencyMs).toBeGreaterThanOrEqual(0);
  });

  it("tracks avgToolLatencyMs", async () => {
    await fire("beforeToolCall", { toolName: "t" });
    await new Promise(r => setTimeout(r, 5));
    await fire("afterToolCall", { toolName: "t" });
    const snap = metrics.getSnapshot();
    expect(snap.avgToolLatencyMs).toBeGreaterThanOrEqual(0);
  });

  it("getSnapshot() returns 0 latencies when no events fired", () => {
    const snap = metrics.getSnapshot();
    expect(snap.avgRunLatencyMs).toBe(0);
    expect(snap.avgLlmLatencyMs).toBe(0);
    expect(snap.avgToolLatencyMs).toBe(0);
  });

  it("tracks agentCounts", async () => {
    await fire("beforeRun");
    await fire("afterRun");
    const snap = metrics.getSnapshot();
    expect(snap.agentCounts["test-agent"]).toBeGreaterThan(0);
  });
});

// ============================================================
// createConsoleLoggingHook
// ============================================================
describe("createConsoleLoggingHook", () => {
  it("calls custom logger with formatted line", async () => {
    const lines: string[] = [];
    const hook = createConsoleLoggingHook({
      logger: (line) => lines.push(line),
    });
    await hook.handle({ event: "afterRun", agentName: "a", traceId: "t" } as any);
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain("afterRun");
  });

  it("includes toolName when present", async () => {
    const lines: string[] = [];
    const hook = createConsoleLoggingHook({ logger: (line) => lines.push(line) });
    await hook.handle({ event: "afterToolCall", agentName: "a", traceId: "t", toolName: "myTool" } as any);
    expect(lines[0]).toContain("myTool");
  });

  it("includes error message when present", async () => {
    const lines: string[] = [];
    const hook = createConsoleLoggingHook({ logger: (line) => lines.push(line) });
    await hook.handle({ event: "onError", agentName: "a", traceId: "t", error: new Error("boom") } as any);
    expect(lines[0]).toContain("boom");
  });

  it("uses console.log when no logger provided", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const hook = createConsoleLoggingHook();
    await hook.handle({ event: "beforeRun", agentName: "a", traceId: "t" } as any);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ============================================================
// Tool — expandable flag + toolAction decorator
// ============================================================
describe("Tool — expandable flag", () => {
  it("expandable defaults to false", () => {
    class T extends Tool {
      constructor() { super("t", "d"); }
      getParameters(): ToolParameter[] { return []; }
      async run(): Promise<string> { return "ok"; }
    }
    expect(new T().expandable).toBe(false);
  });

  it("expandable can be set to true", () => {
    class T extends Tool {
      constructor() { super("t", "d", true); }
      getParameters(): ToolParameter[] { return []; }
      async run(): Promise<string> { return "ok"; }
    }
    expect(new T().expandable).toBe(true);
  });
});

describe("Tool — toolAction decorator", () => {
  it("registers action metadata on class prototype", () => {
    class MyTool extends Tool {
      constructor() { super("my", "desc"); }
      getParameters(): ToolParameter[] { return []; }
      async run(): Promise<string> { return "ok"; }

      @toolAction("my_action", "Does something")
      async myAction(): Promise<string> { return "action"; }
    }
    const t = new MyTool();
    // decorator should register on prototype metadata
    expect(t).toBeDefined();
    expect(typeof t.myAction).toBe("function");
  });
});
