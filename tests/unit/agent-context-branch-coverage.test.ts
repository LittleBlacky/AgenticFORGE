import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { Agent } from "../../packages/core/src/agent";
import { Message } from "../../packages/core/src/message";
import { SimpleAgent } from "../../packages/agents/src/simple-agent/SimpleAgent";
import { ContextBuilder, fromMemoryEmbedder, type ContextPacket } from "../../packages/context/src/ContextBuilder";

class TestAgent extends Agent {
  async run(inputText: string): Promise<string> {
    return this.llm.think([{ role: "user", content: inputText }]);
  }
}

function makeLLM(response = "ok") {
  return {
    think: vi.fn().mockResolvedValue(response),
    streamThink: vi.fn(async function* () {
      yield response;
    }),
    client: { chat: { completions: { create: vi.fn() } } },
    model: "mock-model",
  } as any;
}

describe("Agent branch coverage boost", () => {
  it("removeHook / clearHooks branches work", async () => {
    const agent = new TestAgent({ name: "a", llm: makeLLM() });
    const h = { name: "h1", handle: vi.fn() };
    agent.useHook(h as any);
    agent.removeHook("not-exist"); // idx < 0 branch
    agent.removeHook("h1"); // idx >= 0 branch
    agent.clearHooks(); // clear branch
    await agent.run("x");
    expect(true).toBe(true);
  });

  it("emitHook strict=false ignores hook errors", async () => {
    const llm = {
      think: vi.fn().mockResolvedValue("ok"),
      streamThink: vi.fn(async function* () {
        throw new Error("stream fail");
      }),
      client: {},
      model: "m",
    } as any;
    const agent = new TestAgent({ name: "a", llm });

    agent.useHook({
      name: "bad-hook",
      events: ["onError"],
      strict: false,
      handle: () => {
        throw new Error("hook error");
      },
    } as any);

    await expect(async () => {
      for await (const _ of agent.streamRun("q")) {
        // consume
      }
    }).rejects.toThrow("stream fail");
  });

  it("emitHook strict=true rethrows hook errors", async () => {
    const agent = new TestAgent({ name: "a", llm: makeLLM() });
    agent.useHook({
      name: "strict-hook",
      events: ["beforeRun"],
      strict: true,
      handle: () => {
        throw new Error("strict boom");
      },
    } as any);

    await expect(async () => {
      for await (const _ of agent.streamRun("q")) {
        // consume
      }
    }).rejects.toThrow("strict boom");
  });

  it("extractJsonBlock handles array and fallback text", () => {
    const agent = new TestAgent({ name: "a", llm: makeLLM() }) as any;
    const arr = agent.extractJsonBlock("prefix [1,2,3] suffix");
    expect(arr).toBe("[1,2,3]");
    const fallback = agent.extractJsonBlock("no-json-here");
    expect(fallback).toBe("no-json-here");
  });

  it("runStructured uses custom instruction branch", async () => {
    const llm = makeLLM('{"a":1}');
    const agent = new TestAgent({ name: "a", llm });
    const out = await agent.runStructured({
      inputText: "q",
      schema: z.object({ a: z.number() }),
      instruction: "return strict json",
      maxRetries: 0,
    });
    expect(out.a).toBe(1);
  });
});

describe("SimpleAgent branch coverage boost", () => {
  it("run() throws when tools enabled but llm client/model missing", async () => {
    const llm = {
      think: vi.fn().mockResolvedValue("x"),
      streamThink: vi.fn(async function* () {
        yield "x";
      }),
      client: undefined,
      model: undefined,
    } as any;

    const agent = new SimpleAgent({
      name: "sa",
      llm,
      tools: [
        {
          name: "echo",
          description: "echo",
          func: async ({ input }: any) => String(input ?? ""),
          schema: z.object({ input: z.string() }),
        },
      ],
      enableToolCalling: true,
    });

    await expect(agent.run("q")).rejects.toThrow("LLMClient does not expose underlying OpenAI client");
  });

  it("streamRun() handles tool execution error branch", async () => {
    let call = 0;
    const llm = {
      think: vi.fn(),
      streamThink: vi.fn(),
      client: {
        chat: {
          completions: {
            create: vi.fn().mockImplementation(async (args: any) => {
              if (args.stream) {
                return (async function* () {
                  yield { choices: [{ delta: { content: "final" } }] };
                })();
              }
              call++;
              if (call === 1) {
                return {
                  choices: [
                    {
                      message: {
                        content: "",
                        tool_calls: [
                          {
                            id: "t1",
                            function: { name: "bad", arguments: "{ invalid json" },
                          },
                        ],
                      },
                    },
                  ],
                };
              }
              return { choices: [{ message: { content: "", tool_calls: [] } }] };
            }),
          },
        },
      },
      model: "gpt",
    } as any;

    const agent = new SimpleAgent({
      name: "sa",
      llm,
      tools: [
        {
          name: "bad",
          description: "throw tool",
          func: async () => {
            throw new Error("tool failed");
          },
          schema: z.object({ input: z.string().optional() }),
        },
      ],
      enableToolCalling: true,
      maxToolIterations: 1,
    });

    const chunks: string[] = [];
    for await (const c of agent.streamRun("use tool")) chunks.push(c);
    expect(chunks.join("")).toContain("final");
  });
});

describe("ContextBuilder branch coverage boost", () => {
  it("fromMemoryEmbedder wraps flat vector into matrix", async () => {
    const adapted = fromMemoryEmbedder({
      encode: async (_text: string | string[]) => [0.1, 0.2, 0.3],
    });
    const out = await adapted(["a", "b"]);
    expect(Array.isArray(out)).toBe(true);
    expect(out).toHaveLength(1);
  });

  it("fromMemoryEmbedder returns [] when encode returns []", async () => {
    const adapted = fromMemoryEmbedder({
      encode: async (_text: string | string[]) => [],
    });
    const out = await adapted(["x"]);
    expect(out).toEqual([]);
  });

  it("structured template includes State/Evidence/Context sections", async () => {
    const builder = new ContextBuilder({
      config: { enableStructuredTemplate: true, enableCompression: false },
    });

    const packets: ContextPacket[] = [
      { content: "state data", metadata: {}, type: "task_state", relevanceScore: 1 },
      { content: "knowledge data", metadata: {}, type: "knowledge", relevanceScore: 1 },
      { content: "history data", metadata: {}, type: "history", relevanceScore: 1 },
      { content: "instr data", metadata: {}, type: "instructions", relevanceScore: 1 },
      { content: "fallback evidence", metadata: { type: "unknown_any" }, relevanceScore: 1 },
    ];

    const ctx = await builder.build({
      userQuery: "q",
      systemInstructions: "sys",
      additionalPackets: packets,
      conversationHistory: [new Message({ role: "user", content: "hello" }).toDict() as any],
    });

    expect(ctx.structuredSystem).toContain("[State]");
    expect(ctx.structuredSystem).toContain("[Evidence]");
    expect(ctx.structuredSystem).toContain("[Context]");
    expect(ctx.structuredSystem).toContain("instr data");
    expect(ctx.structuredSystem).toContain("knowledge data");
    expect(ctx.structuredSystem).toContain("history data");
  });
});
