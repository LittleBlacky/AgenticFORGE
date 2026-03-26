/**
 * agents — FunctionCallAgent streaming/onError, SimpleAgent tool-calling/streaming 补充测试
 */
import { describe, it, expect, vi } from "vitest";
import { FunctionCallAgent } from "../../packages/agents/src/function-call-agent/FunctionCallAgent";
import { SimpleAgent } from "../../packages/agents/src/simple-agent/SimpleAgent";
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

function makeToolCallLLM(responses: Array<{ content?: string; tool_calls?: any[] }>) {
  let call = 0;
  const createMock = vi.fn().mockImplementation(async () => {
    const r = responses[Math.min(call, responses.length - 1)];
    call++;
    return { choices: [{ message: r }] };
  });
  return {
    think: vi.fn().mockResolvedValue("plain"),
    streamThink: vi.fn(async function* () {
      yield "streamed";
    }),
    client: { chat: { completions: { create: createMock } } },
    model: "gpt-4o",
    createMock,
  } as any;
}

// ===========================================================================
// FunctionCallAgent — extra paths
// ===========================================================================
describe("FunctionCallAgent — extra paths", () => {
  it("streamRun() no-tools path yields chunks", async () => {
    const llm = {
      think: vi.fn().mockResolvedValue("ok"),
      streamThink: vi.fn(async function* () {
        yield "A";
        yield "B";
      }),
      client: {},
      model: "m",
    } as any;
    const agent = new FunctionCallAgent({ name: "fca", llm });
    const chunks: string[] = [];
    for await (const c of agent.streamRun("q")) chunks.push(c);
    expect(chunks).toEqual(["A", "B"]);
  });

  it("streamRun() with tools executes tool loop then streams final", async () => {
    let call = 0;
    const toolCallResponse = {
      choices: [
        {
          message: {
            content: "",
            tool_calls: [
              { id: "c1", function: { name: "echo", arguments: JSON.stringify({ input: "hi" }) } },
            ],
          },
        },
      ],
    };
    const streamIterable = {
      [Symbol.asyncIterator]: async function* () {
        yield { choices: [{ delta: { content: "streamed-final" } }] };
      },
    };
    const createMock = vi.fn().mockImplementation(async (params: any) => {
      call++;
      if (params.stream) return streamIterable;
      return toolCallResponse;
    });
    const llm = {
      think: vi.fn().mockResolvedValue("ok"),
      streamThink: vi.fn(async function* () {
        yield "s";
      }),
      client: { chat: { completions: { create: createMock } } },
      model: "gpt-4o",
    } as any;
    const registry = new ToolRegistry();
    registry.registerTool(new EchoTool());
    const agent = new FunctionCallAgent({ name: "fca", llm, toolRegistry: registry });
    const chunks: string[] = [];
    for await (const c of agent.streamRun("q")) chunks.push(c);
    expect(chunks.join("")).toBeTruthy();
  });

  it("run() onError hook fires on exception", async () => {
    const llm = {
      think: vi.fn().mockRejectedValue(new Error("LLM error")),
      streamThink: vi.fn(),
      client: {},
      model: "m",
    } as any;
    const agent = new FunctionCallAgent({ name: "fca", llm });
    const errors: string[] = [];
    agent.useHook({
      name: "err",
      events: ["onError"],
      handle: (ctx) => {
        errors.push((ctx.error as Error).message);
      },
    });
    await expect(agent.run("q")).rejects.toThrow("LLM error");
    expect(errors).toContain("LLM error");
  });

  it("run() with tools exhausts maxToolIterations and calls fallback", async () => {
    const createMock = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: "",
            tool_calls: [
              { id: "c1", function: { name: "echo", arguments: JSON.stringify({ input: "x" }) } },
            ],
          },
        },
      ],
    });
    const finalMock = vi
      .fn()
      .mockResolvedValue({ choices: [{ message: { content: "fallback" } }] });
    let callCount = 0;
    const combinedMock = vi.fn().mockImplementation(async (params: any) => {
      callCount++;
      if (params.tool_choice === "none") return finalMock();
      return createMock();
    });
    const llm = {
      think: vi.fn().mockResolvedValue("ok"),
      streamThink: vi.fn(async function* () {
        yield "s";
      }),
      client: { chat: { completions: { create: combinedMock } } },
      model: "gpt-4o",
    } as any;
    const registry = new ToolRegistry();
    registry.registerTool(new EchoTool());
    const agent = new FunctionCallAgent({
      name: "fca",
      llm,
      toolRegistry: registry,
      maxToolIterations: 2,
    });
    const result = await agent.run("q");
    expect(typeof result).toBe("string");
    expect(finalMock).toHaveBeenCalled();
  });

  it("run() beforeRun/afterRun hooks fire", async () => {
    const llm = {
      think: vi.fn().mockResolvedValue("ok"),
      streamThink: vi.fn(),
      client: {},
      model: "m",
    } as any;
    const agent = new FunctionCallAgent({ name: "fca", llm });
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
});

// ===========================================================================
// SimpleAgent — extra paths
// ===========================================================================
describe("SimpleAgent — extra paths", () => {
  it("run() with tools calls client.chat.completions.create", async () => {
    const createMock = vi
      .fn()
      .mockResolvedValue({ choices: [{ message: { content: "tool-answer", tool_calls: [] } }] });
    const llm = {
      think: vi.fn().mockResolvedValue("ok"),
      streamThink: vi.fn(async function* () {
        yield "s";
      }),
      client: { chat: { completions: { create: createMock } } },
      model: "gpt-4o",
    } as any;
    const agent = new SimpleAgent({
      name: "s",
      llm,
      tools: [{ name: "echo", description: "echo", func: async ({ input }: any) => input } as any],
    });
    const result = await agent.run("q");
    expect(createMock).toHaveBeenCalled();
    expect(result).toBe("tool-answer");
  });

  it("run() onError hook fires on exception", async () => {
    const llm = {
      think: vi.fn().mockRejectedValue(new Error("fail")),
      streamThink: vi.fn(),
      client: {},
      model: "m",
    } as any;
    const agent = new SimpleAgent({ name: "s", llm });
    const errors: string[] = [];
    agent.useHook({
      name: "e",
      events: ["onError"],
      handle: (ctx) => {
        errors.push((ctx.error as Error).message);
      },
    });
    await expect(agent.run("q")).rejects.toThrow("fail");
    expect(errors).toContain("fail");
  });

  it("streamRun() with tools runs tool loop then streams", async () => {
    let call = 0;
    const toolCallResponse = {
      choices: [
        {
          message: {
            content: "",
            tool_calls: [
              { id: "c1", function: { name: "echo", arguments: JSON.stringify({ input: "x" }) } },
            ],
          },
        },
      ],
    };
    const streamIterable = {
      [Symbol.asyncIterator]: async function* () {
        yield { choices: [{ delta: { content: "streamed" } }] };
      },
    };
    const createMock = vi.fn().mockImplementation(async (params: any) => {
      call++;
      if (params.stream) return streamIterable;
      return toolCallResponse;
    });
    const llm = {
      think: vi.fn().mockResolvedValue("ok"),
      streamThink: vi.fn(async function* () {
        yield "s";
      }),
      client: { chat: { completions: { create: createMock } } },
      model: "gpt-4o",
    } as any;
    const agent = new SimpleAgent({
      name: "s",
      llm,
      tools: [{ name: "echo", description: "echo", func: async ({ input }: any) => input } as any],
    });
    const chunks: string[] = [];
    for await (const c of agent.streamRun("q")) chunks.push(c);
    expect(chunks.join("")).toBeTruthy();
  });

  it("beforeRun/afterRun hooks fire", async () => {
    const llm = {
      think: vi.fn().mockResolvedValue("ok"),
      streamThink: vi.fn(),
      client: {},
      model: "m",
    } as any;
    const agent = new SimpleAgent({ name: "s", llm });
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
});
