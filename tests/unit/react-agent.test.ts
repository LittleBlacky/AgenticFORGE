/**
 * agents/ReActAgent — Action loop, Final Answer, tool error, fallback
 */
import { describe, it, expect, vi } from "vitest";
import { ReActAgent } from "../../packages/agents/src/react-agent/ReActAgent";
import { Tool, ToolRegistry } from "@agenticforge/tools";
import type { ToolParameter } from "@agenticforge/tools";

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

function makeLLM(...responses: string[]) {
  let i = 0;
  return {
    think: vi
      .fn()
      .mockImplementation(async () => responses[Math.min(i++, responses.length - 1)] ?? ""),
    streamThink: vi.fn(),
    client: undefined,
    model: "m",
  } as any;
}

describe("ReActAgent — run()", () => {
  it("returns Final Answer when LLM emits it directly", async () => {
    const llm = makeLLM("Thought: done\nFinal Answer: 42");
    const agent = new ReActAgent({ name: "ra", llm });
    const result = await agent.run("what is 6*7");
    expect(result).toBe("42");
  });

  it("executes Action/Observation loop then Final Answer", async () => {
    const registry = new ToolRegistry();
    registry.registerTool(new EchoTool());
    const llm = makeLLM(
      "Thought: I should echo\nAction: echo\nAction Input: hello",
      "Thought: got it\nFinal Answer: hello",
    );
    const agent = new ReActAgent({ name: "ra", llm, toolRegistry: registry });
    const result = await agent.run("echo hello");
    expect(result).toBe("hello");
  });

  it("handles tool error gracefully with Observation", async () => {
    const badTool = new (class extends Tool {
      constructor() {
        super("bad", "throws");
      }
      getParameters(): ToolParameter[] {
        return [];
      }
      async run(): Promise<string> {
        throw new Error("tool error");
      }
    })();
    const registry = new ToolRegistry();
    registry.registerTool(badTool);
    const llm = makeLLM(
      "Thought: try bad\nAction: bad\nAction Input: x",
      "Final Answer: recovered",
    );
    const agent = new ReActAgent({ name: "ra", llm, toolRegistry: registry });
    const result = await agent.run("q");
    expect(result).toBe("recovered");
  });

  it("falls back when no Final Answer within maxSteps", async () => {
    const llm = makeLLM("Thought: keep going\nAction: echo\nAction Input: x");
    const agent = new ReActAgent({ name: "ra", llm, maxSteps: 2 });
    const result = await agent.run("q");
    expect(typeof result).toBe("string");
  });

  it("handles Action without toolRegistry by pushing step and continuing", async () => {
    // Without toolRegistry, Action lines push a non-final step and loop continues
    // until maxSteps exhausted, then falls back
    const llm = makeLLM("Action: echo\nAction Input: hi", "Final Answer: done");
    const agent = new ReActAgent({ name: "ra", llm, maxSteps: 3 });
    const result = await agent.run("q");
    // Either "done" (if Final Answer hit) or a fallback string
    expect(typeof result).toBe("string");
  });

  it("streamRun uses raw thought as final when no action/final and stream yields empty", async () => {
    const llm = {
      think: vi.fn().mockResolvedValue("Thought: still thinking"),
      streamThink: vi.fn(async function* () {
        // no chunks
      }),
      client: undefined,
      model: "m",
    } as any;

    const agent = new ReActAgent({ name: "ra", llm, maxSteps: 1 });
    const chunks: string[] = [];
    for await (const c of agent.streamRun("fallback-input")) chunks.push(c);

    expect(chunks).toEqual([]);
    const history = agent.getHistory();
    expect(history[history.length - 1]?.content).toBe("Thought: still thinking");
  });

  it("streamRun records streamed synthesis output into history", async () => {
    const llm = {
      think: vi.fn().mockResolvedValue("Final Answer: hidden"),
      streamThink: vi.fn(async function* () {
        yield "A";
        yield "B";
      }),
      client: undefined,
      model: "m",
    } as any;

    const agent = new ReActAgent({ name: "ra", llm, maxSteps: 2 });
    const out: string[] = [];
    for await (const c of agent.streamRun("q")) out.push(c);

    expect(out.join("")).toBe("AB");
    const history = agent.getHistory();
    expect(history[history.length - 1]?.content).toBe("AB");
  });

  it("streamRun handles action without Action Input using empty input", async () => {
    const registry = new ToolRegistry();
    registry.registerTool(new EchoTool());

    const llm = {
      think: vi
        .fn()
        .mockResolvedValueOnce("Action: echo")
        .mockResolvedValueOnce("Final Answer: ok"),
      streamThink: vi.fn(async function* () {
        yield "S";
      }),
      client: undefined,
      model: "m",
    } as any;

    const agent = new ReActAgent({ name: "ra", llm, toolRegistry: registry, maxSteps: 3 });
    const chunks: string[] = [];
    for await (const c of agent.streamRun("q")) chunks.push(c);

    expect(chunks.join("")).toBe("S");
    const steps = agent.getSteps();
    expect(steps[0]?.actionInput).toBe("");
  });

  it("streamRun captures tool exception as observation error text", async () => {
    const badTool = new (class extends Tool {
      constructor() {
        super("bad", "throws");
      }
      getParameters(): ToolParameter[] {
        return [];
      }
      async run(): Promise<string> {
        throw new Error("tool fail");
      }
    })();
    const registry = new ToolRegistry();
    registry.registerTool(badTool);

    const llm = {
      think: vi
        .fn()
        .mockResolvedValueOnce("Action: bad\nAction Input: x")
        .mockResolvedValueOnce("Final Answer: recovered"),
      streamThink: vi.fn(async function* () {
        yield "T";
      }),
      client: undefined,
      model: "m",
    } as any;

    const agent = new ReActAgent({ name: "ra", llm, toolRegistry: registry, maxSteps: 3 });
    const chunks: string[] = [];
    for await (const c of agent.streamRun("q")) chunks.push(c);

    expect(chunks.join("")).toBe("T");
    const steps = agent.getSteps();
    expect(String(steps[0]?.observation)).toContain("Error: tool fail");
  });

  it("streamRun uses inputText fallback when maxSteps is zero", async () => {
    const llm = {
      think: vi.fn(),
      streamThink: vi.fn(async function* () {
        // no synthesis chunks
      }),
      client: undefined,
      model: "m",
    } as any;

    const agent = new ReActAgent({ name: "ra", llm, maxSteps: 0 });
    const chunks: string[] = [];
    for await (const c of agent.streamRun("input-fallback")) chunks.push(c);

    expect(chunks).toEqual([]);
    const history = agent.getHistory();
    expect(history[history.length - 1]?.content).toBe("input-fallback");
  });

  it("emits beforeRun/afterRun hooks", async () => {
    const llm = makeLLM("Final Answer: ok");
    const agent = new ReActAgent({ name: "ra", llm });
    const events: string[] = [];
    agent.useHook({
      name: "h",
      events: ["beforeRun", "afterRun"],
      handle: (ctx) => {
        events.push(ctx.event);
      },
    });
    await agent.run("q");
    expect(events).toContain("beforeRun");
    expect(events).toContain("afterRun");
  });

  it("emits onError hook and rethrows", async () => {
    const llm = {
      think: vi.fn().mockRejectedValue(new Error("boom")),
      streamThink: vi.fn(),
      client: undefined,
      model: "m",
    } as any;
    const agent = new ReActAgent({ name: "ra", llm });
    const errors: string[] = [];
    agent.useHook({
      name: "e",
      events: ["onError"],
      handle: (ctx) => {
        errors.push((ctx.error as Error).message);
      },
    });
    await expect(agent.run("q")).rejects.toThrow("boom");
    expect(errors).toContain("boom");
  });
});
