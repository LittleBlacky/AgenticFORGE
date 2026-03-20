/**
 * @agenticforge/agents 鈥?WorkflowEngine 娣卞害娴嬭瘯
 * 瑕嗙洊锛歵opoSort, sequential, parallel, branch, loop, fn, passthrough, error handling
 */
import { describe, it, expect, vi } from "vitest";
import { WorkflowEngine } from "../../packages/agents/src/workflow-agent/WorkflowEngine";
import { WorkflowAgent } from "../../packages/agents/src/workflow-agent/WorkflowAgent";
import type { WorkflowDefinition } from "../../packages/agents/src/workflow-agent/types";

function makeMockLLM(response = "llm-output") {
  return {
    think: vi.fn().mockResolvedValue(response),
    streamThink: vi.fn(),
    client: {}, model: "mock",
  } as any;
}

function makeEngine(opts: { verbose?: boolean; maxConcurrency?: number; llmResponse?: string } = {}) {
  return new WorkflowEngine({
    llm: makeMockLLM(opts.llmResponse ?? "llm-output"),
    verbose: opts.verbose ?? false,
    maxConcurrency: opts.maxConcurrency,
  });
}

// ===========================================================================
// Sequential execution
// ===========================================================================
describe("WorkflowEngine 鈥?Sequential", () => {
  it("single fn node returns its output", async () => {
    const engine = makeEngine();
    const def: WorkflowDefinition = {
      name: "test",
      nodes: [
        { id: "a", type: "fn", executor: async () => "result-a", depends: [] },
      ],
    };
    const r = await engine.execute(def, "input");
    expect(r.output).toBe("result-a");
    expect(r.nodeResults).toHaveLength(1);
    expect(r.nodeResults[0]!.status).toBe("done");
  });

  it("linear chain A鈫払鈫扖 executes in order", async () => {
    const order: string[] = [];
    const engine = makeEngine();
    const def: WorkflowDefinition = {
      name: "chain",
      nodes: [
        { id: "a", type: "fn", executor: async () => { order.push("a"); return "A"; }, depends: [] },
        { id: "b", type: "fn", executor: async (ctx) => { order.push("b"); return ctx["a"] + "B"; }, depends: ["a"] },
        { id: "c", type: "fn", executor: async (ctx) => { order.push("c"); return ctx["b"] + "C"; }, depends: ["b"] },
      ],
    };
    const r = await engine.execute(def, "start");
    expect(order).toEqual(["a", "b", "c"]);
    expect(r.output).toBe("ABC");
  });

  it("passthrough node transparently passes input", async () => {
    const engine = makeEngine();
    const def: WorkflowDefinition = {
      name: "pt",
      nodes: [{ id: "p", type: "passthrough", depends: [] }],
    };
    const r = await engine.execute(def, "hello");
    expect(r.output).toBe("hello");
  });

  it("passthrough with sourceKey reads from context", async () => {
    const engine = makeEngine();
    const def: WorkflowDefinition = {
      name: "pt2",
      nodes: [
        { id: "a", type: "fn", executor: async () => "from-a", depends: [] },
        { id: "p", type: "passthrough", sourceKey: "a", depends: ["a"] },
      ],
    };
    const r = await engine.execute(def, "ignored");
    expect(r.output).toBe("from-a");
  });

  it("llm node calls llm.think with interpolated prompt", async () => {
    const llm = makeMockLLM("llm-says-hi");
    const engine = new WorkflowEngine({ llm });
    const def: WorkflowDefinition = {
      name: "llm",
      nodes: [{ id: "q", type: "llm", promptTemplate: "Answer: {input}", depends: [] }],
    };
    const r = await engine.execute(def, "question");
    expect(r.output).toBe("llm-says-hi");
    expect(llm.think).toHaveBeenCalledOnce();
    const callArgs = llm.think.mock.calls[0][0] as Array<{ role: string; content: string }>;
    expect(callArgs.some(m => m.content.includes("question"))).toBe(true);
  });

  it("llm node includes systemPrompt when provided", async () => {
    const llm = makeMockLLM("ok");
    const engine = new WorkflowEngine({ llm });
    const def: WorkflowDefinition = {
      name: "sys",
      nodes: [{ id: "q", type: "llm", promptTemplate: "{input}", systemPrompt: "You are helpful.", depends: [] }],
    };
    await engine.execute(def, "q");
    const msgs = llm.think.mock.calls[0][0] as Array<{ role: string; content: string }>;
    expect(msgs[0]!.role).toBe("system");
    expect(msgs[0]!.content).toBe("You are helpful.");
  });
});

// ===========================================================================
// Parallel execution
// ===========================================================================
describe("WorkflowEngine 鈥?Parallel", () => {
  it("independent nodes execute concurrently", async () => {
    const starts: number[] = [];
    const engine = makeEngine();
    const def: WorkflowDefinition = {
      name: "par",
      nodes: [
        {
          id: "a", type: "fn", depends: [],
          executor: async () => { starts.push(Date.now()); await new Promise(r => setTimeout(r, 20)); return "A"; },
        },
        {
          id: "b", type: "fn", depends: [],
          executor: async () => { starts.push(Date.now()); await new Promise(r => setTimeout(r, 20)); return "B"; },
        },
        { id: "c", type: "fn", depends: ["a", "b"], executor: async (ctx) => ctx["a"]! + ctx["b"]! },
      ],
    };
    const r = await engine.execute(def, "x");
    expect(r.output).toBe("AB");
    // Both a and b should start within ~50ms of each other (concurrent)
    expect(Math.abs(starts[0]! - starts[1]!)).toBeLessThan(50);
  });

  it("maxConcurrency=1 forces sequential execution", async () => {
    const order: string[] = [];
    const engine = makeEngine({ maxConcurrency: 1 });
    const def: WorkflowDefinition = {
      name: "seq",
      nodes: [
        { id: "a", type: "fn", depends: [], executor: async () => { order.push("a"); return "A"; } },
        { id: "b", type: "fn", depends: [], executor: async () => { order.push("b"); return "B"; } },
      ],
    };
    await engine.execute(def, "x");
    expect(order).toHaveLength(2);
  });

  it("context contains outputs from all parallel nodes", async () => {
    const engine = makeEngine();
    const def: WorkflowDefinition = {
      name: "ctx",
      nodes: [
        { id: "x", type: "fn", depends: [], executor: async () => "X" },
        { id: "y", type: "fn", depends: [], executor: async () => "Y" },
        { id: "z", type: "fn", depends: ["x", "y"], executor: async (ctx) => ctx["x"]! + ctx["y"]! },
      ],
    };
    const r = await engine.execute(def, "_");
    expect(r.context["x"]).toBe("X");
    expect(r.context["y"]).toBe("Y");
    expect(r.output).toBe("XY");
  });
});

// ===========================================================================
// Branch execution
// ===========================================================================
describe("WorkflowEngine — Branch", () => {
  it("executes the matched branch", async () => {
    const engine = makeEngine();
    const def: WorkflowDefinition = {
      name: "br",
      nodes: [{
        id: "router", type: "branch", depends: [],
        condition: async () => "b",
        branches: {
          a: [{ id: "na", type: "fn", depends: [], executor: async () => "branch-a" }],
          b: [{ id: "nb", type: "fn", depends: [], executor: async () => "branch-b" }],
        },
      }],
    };
    const r = await engine.execute(def, "x");
    expect(r.output).toBe("branch-b");
    expect(r.nodeResults.find(n => n.nodeId === "router")?.branch).toBe("b");
  });

  it("branch condition receives context", async () => {
    const engine = makeEngine();
    const def: WorkflowDefinition = {
      name: "ctx-br",
      nodes: [
        { id: "pre", type: "fn", depends: [], executor: async () => "complex" },
        {
          id: "router", type: "branch", depends: ["pre"],
          condition: async (ctx) => ctx["pre"]!.includes("complex") ? "heavy" : "light",
          branches: {
            heavy: [{ id: "h", type: "fn", depends: [], executor: async () => "heavy-result" }],
            light: [{ id: "l", type: "fn", depends: [], executor: async () => "light-result" }],
          },
        },
      ],
    };
    const r = await engine.execute(def, "x");
    expect(r.output).toBe("heavy-result");
  });

  it("throws when condition returns undefined branch", async () => {
    const engine = makeEngine();
    const def: WorkflowDefinition = {
      name: "bad-br",
      nodes: [{
        id: "r", type: "branch", depends: [],
        condition: async () => "nonexistent",
        branches: { a: [], b: [] },
      }],
    };
    const r = await engine.execute(def, "x");
    // node should be failed with error
    expect(r.nodeResults.find(n => n.nodeId === "r")?.status).toBe("failed");
  });

  it("branch sub-DAG can have multiple nodes", async () => {
    const engine = makeEngine();
    const def: WorkflowDefinition = {
      name: "multi-br",
      nodes: [{
        id: "r", type: "branch", depends: [],
        condition: async () => "go",
        branches: {
          go: [
            { id: "s1", type: "fn", depends: [], executor: async () => "step1" },
            { id: "s2", type: "fn", depends: ["s1"], executor: async (ctx) => ctx["s1"]! + "-step2" },
          ],
        },
      }],
    };
    const r = await engine.execute(def, "x");
    expect(r.output).toBe("step1-step2");
  });
});

// ===========================================================================
// Loop execution
// ===========================================================================
describe("WorkflowEngine — Loop", () => {
  it("runs body at least once (do-while)", async () => {
    let count = 0;
    const engine = makeEngine();
    const def: WorkflowDefinition = {
      name: "loop",
      nodes: [{
        id: "lp", type: "loop", depends: [],
        maxIterations: 3,
        condition: async (_ctx, iter) => iter < 2,
        body: [{ id: "step", type: "fn", depends: [], executor: async () => { count++; return `iter-${count}`; } }],
      }],
    };
    const r = await engine.execute(def, "x");
    expect(count).toBe(2);
    expect(r.nodeResults.find(n => n.nodeId === "lp")?.iterations).toBe(2);
  });

  it("respects maxIterations", async () => {
    let count = 0;
    const engine = makeEngine();
    const def: WorkflowDefinition = {
      name: "max-loop",
      nodes: [{
        id: "lp", type: "loop", depends: [],
        maxIterations: 3,
        body: [{ id: "s", type: "fn", depends: [], executor: async () => { count++; return "x"; } }],
      }],
    };
    await engine.execute(def, "x");
    expect(count).toBe(3);
  });

  it("stops when condition returns false", async () => {
    let count = 0;
    const engine = makeEngine();
    const def: WorkflowDefinition = {
      name: "cond-loop",
      nodes: [{
        id: "lp", type: "loop", depends: [],
        maxIterations: 10,
        condition: async (_ctx, iter) => iter < 3,
        body: [{ id: "s", type: "fn", depends: [], executor: async () => { count++; return String(count); } }],
      }],
    };
    const r = await engine.execute(def, "x");
    expect(count).toBe(3);
    expect(r.output).toBe("3");
  });

  it("loop body can reference previous iteration output via {loopNodeId}", async () => {
    const engine = makeEngine();
    const def: WorkflowDefinition = {
      name: "ctx-loop",
      nodes: [{
        id: "lp", type: "loop", depends: [],
        maxIterations: 2,
        body: [{ id: "s", type: "fn", depends: [], executor: async (ctx) => (ctx["lp"] || "") + "x" }],
      }],
    };
    const r = await engine.execute(def, "_");
    // first iter: "" + "x" = "x"; second iter: "x" + "x" = "xx"
    expect(r.output).toBe("xx");
  });
});

// ===========================================================================
// Error handling
// ===========================================================================
describe("WorkflowEngine — Error handling", () => {
  it("failing node produces status=failed in nodeResults", async () => {
    const engine = makeEngine();
    const def: WorkflowDefinition = {
      name: "err",
      nodes: [{ id: "bad", type: "fn", depends: [], executor: async () => { throw new Error("boom"); } }],
    };
    const r = await engine.execute(def, "x");
    const badResult = r.nodeResults.find(n => n.nodeId === "bad");
    expect(badResult?.status).toBe("failed");
    expect(badResult?.error).toContain("boom");
  });

  it("throws on circular dependency", async () => {
    const engine = makeEngine();
    const def: WorkflowDefinition = {
      name: "cycle",
      nodes: [
        { id: "a", type: "fn", depends: ["b"], executor: async () => "A" },
        { id: "b", type: "fn", depends: ["a"], executor: async () => "B" },
      ],
    };
    await expect(engine.execute(def, "x")).rejects.toThrow();
  });

  it("throws on reference to undefined dependency", async () => {
    const engine = makeEngine();
    const def: WorkflowDefinition = {
      name: "undef-dep",
      nodes: [{ id: "a", type: "fn", depends: ["nonexistent"], executor: async () => "A" }],
    };
    await expect(engine.execute(def, "x")).rejects.toThrow();
  });

  it("tool node without registry produces failed node", async () => {
    const engine = makeEngine();
    const def: WorkflowDefinition = {
      name: "tool-no-reg",
      nodes: [{ id: "t", type: "tool", toolName: "search", inputTemplate: "{input}", depends: [] }],
    };
    const r = await engine.execute(def, "x");
    expect(r.nodeResults.find(n => n.nodeId === "t")?.status).toBe("failed");
  });

  it("durationMs is recorded for each node", async () => {
    const engine = makeEngine();
    const def: WorkflowDefinition = {
      name: "dur",
      nodes: [{ id: "a", type: "fn", depends: [], executor: async () => "x" }],
    };
    const r = await engine.execute(def, "x");
    expect(r.nodeResults[0]?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("context snapshot contains all node outputs", async () => {
    const engine = makeEngine();
    const def: WorkflowDefinition = {
      name: "snap",
      nodes: [
        { id: "a", type: "fn", depends: [], executor: async () => "AA" },
        { id: "b", type: "fn", depends: ["a"], executor: async () => "BB" },
      ],
    };
    const r = await engine.execute(def, "start");
    expect(r.context["input"]).toBe("start");
    expect(r.context["a"]).toBe("AA");
    expect(r.context["b"]).toBe("BB");
  });
});

// ===========================================================================
// WorkflowAgent
// ===========================================================================
describe("WorkflowAgent", () => {
  it("runWorkflow() returns WorkflowResult", async () => {
    const agent = new WorkflowAgent({ name: "wa", llm: makeMockLLM() });
    const def: WorkflowDefinition = {
      name: "simple",
      nodes: [{ id: "a", type: "fn", depends: [], executor: async () => "done" }],
    };
    const r = await agent.runWorkflow(def, "input");
    expect(r.output).toBe("done");
    expect(r.nodeResults).toHaveLength(1);
  });

  it("setWorkflow() + run() executes preset workflow", async () => {
    const agent = new WorkflowAgent({ name: "wa", llm: makeMockLLM() });
    const def: WorkflowDefinition = {
      name: "preset",
      nodes: [{ id: "a", type: "fn", depends: [], executor: async () => "preset-output" }],
    };
    agent.setWorkflow(def);
    expect(await agent.run("any input")).toBe("preset-output");
  });

  it("run() without setWorkflow() throws", async () => {
    const agent = new WorkflowAgent({ name: "wa", llm: makeMockLLM() });
    await expect(agent.run("input")).rejects.toThrow();
  });

  it("runWorkflow() adds messages to history", async () => {
    const agent = new WorkflowAgent({ name: "wa", llm: makeMockLLM() });
    const def: WorkflowDefinition = {
      name: "hist",
      nodes: [{ id: "a", type: "fn", depends: [], executor: async () => "hi" }],
    };
    await agent.runWorkflow(def, "hello");
    const history = agent.getHistory();
    expect(history.some(m => m.role === "user" && m.content === "hello")).toBe(true);
    expect(history.some(m => m.role === "assistant" && m.content === "hi")).toBe(true);
  });
});

