/**
 * @agenticforge/agents — 单元测试
 * 覆盖：SimpleAgent, FunctionCallAgent (无工具路径)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SimpleAgent } from "../../packages/agents/src/simple-agent/SimpleAgent";
import { FunctionCallAgent } from "../../packages/agents/src/function-call-agent/FunctionCallAgent";
import { Tool } from "@agenticforge/tools";
import { ToolRegistry } from "@agenticforge/tools";
import type { ToolParameter } from "@agenticforge/tools";

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
// SimpleAgent
// ===========================================================================
describe("SimpleAgent", () => {
  let agent: SimpleAgent;
  let mockLLM: ReturnType<typeof makeMockLLM>;

  beforeEach(() => {
    mockLLM = makeMockLLM();
    agent = new SimpleAgent({ name: "simple", llm: mockLLM });
  });

  it("run() calls llm.think and returns response", async () => {
    const result = await agent.run("hello");
    expect(result).toBe("agent-response");
    expect(mockLLM.think).toHaveBeenCalledOnce();
  });

  it("run() adds messages to history", async () => {
    await agent.run("hello");
    const history = agent.getHistory();
    expect(history.some(m => m.role === "user" && m.content === "hello")).toBe(true);
    expect(history.some(m => m.role === "assistant")).toBe(true);
  });

  it("run() with custom systemPrompt includes it in messages", async () => {
    const a = new SimpleAgent({ name: "s", llm: mockLLM, systemPrompt: "Custom sys" });
    await a.run("q");
    const msgs = mockLLM.think.mock.calls[0][0] as Array<{ role: string; content: string }>;
    expect(msgs[0]!.content).toBe("Custom sys");
  });

  it("streamRun() yields the run() result", async () => {
    const chunks: string[] = [];
    for await (const chunk of agent.streamRun("hello")) {
      chunks.push(chunk);
    }
    expect(chunks.join("")).toBe("agent-response");
  });

  it("clearHistory() empties history after run", async () => {
    await agent.run("hello");
    agent.clearHistory();
    expect(agent.getHistory()).toHaveLength(0);
  });

  it("run() without tools does not use tool calling", async () => {
    await agent.run("q");
    // client.chat.completions.create should NOT be called for plain LLM
    expect(mockLLM.client.chat.completions.create).not.toHaveBeenCalled();
  });

  it("hook order: beforeToolCall -> afterToolCall in SimpleAgent", async () => {
    let callCount = 0;
    const createMock = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          choices: [{
            message: {
              content: "",
              tool_calls: [{ id: "t1", function: { name: "echo", arguments: JSON.stringify({ input: "hello" }) } }],
            },
          }],
        };
      }
      return { choices: [{ message: { content: "done", tool_calls: [] } }] };
    });

    const llm = {
      ...makeMockLLM(),
      client: { chat: { completions: { create: createMock } } },
      model: "gpt-4o",
    } as any;

    const events: string[] = [];
    const a = new SimpleAgent({
      name: "simple-hooks",
      llm,
      tools: [
        {
          name: "echo",
          description: "echo",
          func: async ({ input }: { input: string }) => input,
        } as any,
      ],
    });

    a.useHook({
      name: "tool-order",
      events: ["beforeToolCall", "afterToolCall"],
      handle: (ctx) => {
        events.push(`${ctx.event}:${ctx.toolName}`);
      },
    });

    const result = await a.run("use tool");
    expect(result).toBe("done");
    expect(events).toEqual(["beforeToolCall:echo", "afterToolCall:echo"]);
  });
});

// ===========================================================================
// FunctionCallAgent — no-tools path
// ===========================================================================
describe("FunctionCallAgent — no tools", () => {
  let agent: FunctionCallAgent;
  let mockLLM: ReturnType<typeof makeMockLLM>;

  beforeEach(() => {
    mockLLM = makeMockLLM("fca-response");
    agent = new FunctionCallAgent({ name: "fca", llm: mockLLM });
  });

  it("run() without tools calls llm.think", async () => {
    const result = await agent.run("hello");
    expect(result).toBe("fca-response");
    expect(mockLLM.think).toHaveBeenCalledOnce();
  });

  it("hasTools() false when no tools provided", () => {
    expect(agent.hasTools()).toBe(false);
  });

  it("listTools() empty when no tools", () => {
    expect(agent.listTools()).toHaveLength(0);
  });

  it("run() adds messages to history", async () => {
    await agent.run("q");
    expect(agent.getHistory().length).toBe(2);
  });

  it("streamRun() yields the result", async () => {
    const chunks: string[] = [];
    for await (const c of agent.streamRun("q")) chunks.push(c);
    expect(chunks.join("")).toBe("fca-response");
  });
});

// ===========================================================================
// FunctionCallAgent — with ToolRegistry
// ===========================================================================
describe("FunctionCallAgent — with ToolRegistry", () => {
  it("hasTools() true when toolRegistry provided", () => {
    const mockLLM = makeMockLLM();
    const registry = new ToolRegistry();
    registry.registerTool(new EchoTool());
    const agent = new FunctionCallAgent({ name: "fca", llm: mockLLM, toolRegistry: registry });
    expect(agent.hasTools()).toBe(true);
  });

  it("listTools() returns tool names", () => {
    const mockLLM = makeMockLLM();
    const registry = new ToolRegistry();
    registry.registerTool(new EchoTool());
    const agent = new FunctionCallAgent({ name: "fca", llm: mockLLM, toolRegistry: registry });
    expect(agent.listTools()).toContain("echo");
  });

  it("addTool() registers additional tool", () => {
    const mockLLM = makeMockLLM();
    const registry = new ToolRegistry();
    const agent = new FunctionCallAgent({ name: "fca", llm: mockLLM, toolRegistry: registry });
    agent.addTool(new EchoTool());
    expect(agent.listTools()).toContain("echo");
  });

  it("removeTool() unregisters tool", () => {
    const mockLLM = makeMockLLM();
    const registry = new ToolRegistry();
    registry.registerTool(new EchoTool());
    const agent = new FunctionCallAgent({ name: "fca", llm: mockLLM, toolRegistry: registry });
    expect(agent.removeTool("echo")).toBe(true);
    expect(agent.listTools()).not.toContain("echo");
  });

  it("run() with tools calls client.chat.completions.create", async () => {
    const createMock = vi.fn().mockResolvedValue({
      choices: [{ message: { content: "final answer", tool_calls: [] } }],
    });
    const mockLLM = {
      ...makeMockLLM(),
      client: { chat: { completions: { create: createMock } } },
      model: "gpt-4o",
    } as any;
    const registry = new ToolRegistry();
    registry.registerTool(new EchoTool());
    const agent = new FunctionCallAgent({ name: "fca", llm: mockLLM, toolRegistry: registry });
    const result = await agent.run("question");
    expect(createMock).toHaveBeenCalled();
    expect(result).toBe("final answer");
  });

  it("run() executes tool call and continues conversation", async () => {
    let callCount = 0;
    const createMock = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          choices: [{
            message: {
              content: "",
              tool_calls: [{ id: "c1", function: { name: "echo", arguments: JSON.stringify({ input: "hello" }) } }],
            },
          }],
        };
      }
      return { choices: [{ message: { content: "done after tool", tool_calls: [] } }] };
    });
    const mockLLM = {
      ...makeMockLLM(),
      client: { chat: { completions: { create: createMock } } },
      model: "gpt-4o",
    } as any;
    const registry = new ToolRegistry();
    registry.registerTool(new EchoTool());
    const agent = new FunctionCallAgent({ name: "fca", llm: mockLLM, toolRegistry: registry });
    const result = await agent.run("use echo tool");
    expect(result).toBe("done after tool");
    expect(callCount).toBe(2);
  });

  it("hook order: beforeToolCall -> afterToolCall in FunctionCallAgent", async () => {
    let callCount = 0;
    const createMock = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          choices: [{
            message: {
              content: "",
              tool_calls: [{ id: "c1", function: { name: "echo", arguments: JSON.stringify({ input: "hello" }) } }],
            },
          }],
        };
      }
      return { choices: [{ message: { content: "done after tool", tool_calls: [] } }] };
    });

    const mockLLM = {
      ...makeMockLLM(),
      client: { chat: { completions: { create: createMock } } },
      model: "gpt-4o",
    } as any;

    const registry = new ToolRegistry();
    registry.registerTool(new EchoTool());

    const events: string[] = [];
    const agent = new FunctionCallAgent({ name: "fca", llm: mockLLM, toolRegistry: registry });
    agent.useHook({
      name: "tool-order",
      events: ["beforeToolCall", "afterToolCall"],
      handle: (ctx) => {
        events.push(`${ctx.event}:${ctx.toolName}`);
      },
    });

    const result = await agent.run("use echo tool");
    expect(result).toBe("done after tool");
    expect(events).toEqual(["beforeToolCall:echo", "afterToolCall:echo"]);
  });
});
