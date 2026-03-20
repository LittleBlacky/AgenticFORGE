/**
 * @agenticforge/core — 单元测试
 * 覆盖：Message, Agent(基类), LLMClient(mock)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Message } from "../../packages/core/src/message";
import { Agent } from "../../packages/core/src/agent";
import { Config } from "../../packages/core/src/config";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Minimal concrete Agent for testing abstract base
// ---------------------------------------------------------------------------
class TestAgent extends Agent {
  async run(inputText: string): Promise<string> {
    const response = await this.llm.think([
      { role: "user", content: inputText },
    ]);
    this.addMessage(new Message({ role: "user", content: inputText }));
    this.addMessage(new Message({ role: "assistant", content: response }));
    return response;
  }
}

// ---------------------------------------------------------------------------
// Mock LLMClient
// ---------------------------------------------------------------------------
function makeMockLLM(response = "mocked response") {
  return {
    think: vi.fn().mockResolvedValue(response),
    streamThink: vi.fn(async function* () {
      yield response;
    }),
    client: { chat: { completions: { create: vi.fn() } } },
    model: "mock-model",
  } as any;
}

// ===========================================================================
// Message
// ===========================================================================
describe("Message", () => {
  it("constructs with required fields", () => {
    const msg = new Message({ role: "user", content: "hello" });
    expect(msg.role).toBe("user");
    expect(msg.content).toBe("hello");
    expect(msg.timestamp).toBeInstanceOf(Date);
    expect(msg.metadata).toEqual({});
  });

  it("accepts optional timestamp and metadata", () => {
    const ts = new Date("2024-01-01");
    const meta = { sessionId: "abc" };
    const msg = new Message({ role: "assistant", content: "hi", timestamp: ts, metadata: meta });
    expect(msg.timestamp).toBe(ts);
    expect(msg.metadata).toEqual(meta);
  });

  it("toDict returns role and content", () => {
    const msg = new Message({ role: "system", content: "sys" });
    expect(msg.toDict()).toEqual({ role: "system", content: "sys" });
  });

  it("toString formats correctly", () => {
    const msg = new Message({ role: "user", content: "test" });
    expect(msg.toString()).toBe("[user] test");
  });

  it("supports all valid roles", () => {
    for (const role of ["user", "assistant", "system", "tool"] as const) {
      const msg = new Message({ role, content: "x" });
      expect(msg.role).toBe(role);
    }
  });
});

// ===========================================================================
// Config
// ===========================================================================
describe("Config", () => {
  it("creates with defaults", () => {
    const cfg = new Config();
    expect(cfg).toBeDefined();
  });

  it("can be instantiated multiple times independently", () => {
    const c1 = new Config();
    const c2 = new Config();
    expect(c1).not.toBe(c2);
  });
});

// ===========================================================================
// Agent (abstract base via TestAgent)
// ===========================================================================
describe("Agent (base class)", () => {
  let agent: TestAgent;
  let mockLLM: ReturnType<typeof makeMockLLM>;

  beforeEach(() => {
    mockLLM = makeMockLLM();
    agent = new TestAgent({ name: "test", llm: mockLLM });
  });

  it("initialises with empty history", () => {
    expect(agent.getHistory()).toHaveLength(0);
  });

  it("run() calls llm.think and adds messages to history", async () => {
    const result = await agent.run("hello");
    expect(result).toBe("mocked response");
    expect(mockLLM.think).toHaveBeenCalledOnce();
    expect(agent.getHistory()).toHaveLength(2);
  });

  it("addMessage() appends to history", () => {
    agent.addMessage(new Message({ role: "user", content: "a" }));
    agent.addMessage(new Message({ role: "assistant", content: "b" }));
    expect(agent.getHistory()).toHaveLength(2);
  });

  it("clearHistory() empties history", async () => {
    await agent.run("hello");
    agent.clearHistory();
    expect(agent.getHistory()).toHaveLength(0);
  });

  it("getHistory() returns a copy, not the internal reference", () => {
    agent.addMessage(new Message({ role: "user", content: "x" }));
    const h1 = agent.getHistory();
    const h2 = agent.getHistory();
    expect(h1).not.toBe(h2); // different array instances
    expect(h1).toEqual(h2);
  });

  it("toString() includes name", () => {
    expect(agent.toString()).toContain("test");
  });

  // -------------------------------------------------------------------------
  // runStructured
  // -------------------------------------------------------------------------
  describe("runStructured()", () => {
    const schema = z.object({ answer: z.string(), score: z.number() });

    it("parses valid JSON response", async () => {
      mockLLM.think.mockResolvedValue('{"answer":"yes","score":42}');
      const result = await agent.runStructured({ inputText: "q", schema });
      expect(result).toEqual({ answer: "yes", score: 42 });
    });

    it("parses JSON wrapped in markdown code block", async () => {
      mockLLM.think.mockResolvedValue('```json\n{"answer":"ok","score":1}\n```');
      const result = await agent.runStructured({ inputText: "q", schema });
      expect(result).toEqual({ answer: "ok", score: 1 });
    });

    it("throws after maxRetries on persistent JSON parse failure", async () => {
      mockLLM.think.mockResolvedValue("not json at all");
      await expect(
        agent.runStructured({ inputText: "q", schema, maxRetries: 1 })
      ).rejects.toThrow();
    });

    it("throws after maxRetries on schema validation failure", async () => {
      mockLLM.think.mockResolvedValue('{"wrong":"shape"}');
      await expect(
        agent.runStructured({ inputText: "q", schema, maxRetries: 0 })
      ).rejects.toThrow();
    });

    it("retries and eventually succeeds", async () => {
      mockLLM.think
        .mockResolvedValueOnce("bad")
        .mockResolvedValueOnce('{"answer":"retry","score":99}');
      const result = await agent.runStructured({ inputText: "q", schema, maxRetries: 2 });
      expect(result).toEqual({ answer: "retry", score: 99 });
    });
  });

  // -------------------------------------------------------------------------
  // extractJsonBlock (tested via runStructured side-effects)
  // -------------------------------------------------------------------------
  describe("extractJsonBlock edge cases", () => {
    const schema = z.object({ x: z.number() });

    it("handles bare JSON object", async () => {
      mockLLM.think.mockResolvedValue('{"x":7}');
      const r = await agent.runStructured({ inputText: "q", schema });
      expect(r).toEqual({ x: 7 });
    });

    it("extracts JSON embedded in surrounding text", async () => {
      mockLLM.think.mockResolvedValue('Here is your answer: {"x":3} end.');
      const r = await agent.runStructured({ inputText: "q", schema });
      expect(r).toEqual({ x: 3 });
    });
  });
});

// ===========================================================================
// Agent.streamRun() — 基类真流式
// ===========================================================================
describe("Agent.streamRun() (base class)", () => {
  it("yields chunks and records history", async () => {
    const mockLLM = {
      think: vi.fn(),
      streamThink: vi.fn(async function* () {
        yield "hello ";
        yield "world";
      }),
      client: {},
      model: "mock",
    } as any;
    const agent = new TestAgent({ name: "stream-test", llm: mockLLM });
    const chunks: string[] = [];
    for await (const chunk of agent.streamRun("hi")) {
      chunks.push(chunk);
    }
    expect(chunks).toEqual(["hello ", "world"]);
    const history = agent.getHistory();
    expect(history).toHaveLength(2);
    expect(history[0]!.role).toBe("user");
    expect(history[0]!.content).toBe("hi");
    expect(history[1]!.role).toBe("assistant");
    expect(history[1]!.content).toBe("hello world");
  });

  it("includes systemPrompt and prior history in messages", async () => {
    const captured: Array<{role: string}> = [];
    const mockLLM = {
      think: vi.fn(),
      streamThink: vi.fn(async function* (msgs: Array<{role: string}>) {
        for (const m of msgs) captured.push(m);
        yield "ok";
      }),
      client: {},
      model: "mock",
    } as any;
    const agent = new TestAgent({ name: "s", llm: mockLLM, systemPrompt: "be helpful" });
    agent.addMessage(new Message({ role: "user", content: "prev" }));
    agent.addMessage(new Message({ role: "assistant", content: "sure" }));
    for await (const _ of agent.streamRun("new question")) { /* consume */ }
    expect(captured.map((m) => m.role)).toEqual(["system", "user", "assistant", "user"]);
  });

  it("passes temperature option to streamThink", async () => {
    let capturedTemp: unknown;
    const mockLLM = {
      think: vi.fn(),
      streamThink: vi.fn(async function* (_msgs: unknown[], temp: unknown) {
        capturedTemp = temp;
        yield "result";
      }),
      client: {},
      model: "mock",
    } as any;
    const agent = new TestAgent({ name: "t", llm: mockLLM });
    for await (const _ of agent.streamRun("q", { temperature: 0.7 })) { /* consume */ }
    expect(capturedTemp).toBe(0.7);
  });
});

// ===========================================================================
// streamThinkChunked — thinking model support
// ===========================================================================
import { LLMClient } from "../../packages/core/src/llm";
import type { StreamChunk } from "../../packages/core/src/types";

describe("LLMClient.streamThinkChunked()", () => {
  function makeLLMWithDeltas(deltas: Array<Record<string, string>>): LLMClient {
    const stream = (async function* () {
      for (const d of deltas) yield { choices: [{ delta: d }] };
    })();
    const fake = {
      chat: { completions: { create: vi.fn().mockResolvedValue(stream) } },
    };
    const llm = Object.create(LLMClient.prototype) as LLMClient;
    (llm as any).client = fake;
    (llm as any).model = "mock";
    return llm;
  }

  it("yields content chunks from normal model", async () => {
    const llm = makeLLMWithDeltas([
      { content: "hello " },
      { content: "world" },
    ]);
    const chunks: StreamChunk[] = [];
    for await (const c of llm.streamThinkChunked([])) chunks.push(c);
    expect(chunks).toEqual([
      { type: "content", text: "hello " },
      { type: "content", text: "world" },
    ]);
  });

  it("yields thinking chunks from thinking model", async () => {
    const llm = makeLLMWithDeltas([
      { reasoning_content: "let me think" },
      { content: "answer" },
    ]);
    const chunks: StreamChunk[] = [];
    for await (const c of llm.streamThinkChunked([])) chunks.push(c);
    expect(chunks).toEqual([
      { type: "thinking", text: "let me think" },
      { type: "content", text: "answer" },
    ]);
  });

  it("streamThink content-only mode skips thinking chunks", async () => {
    const llm = makeLLMWithDeltas([
      { reasoning_content: "thinking..." },
      { content: "final answer" },
    ]);
    const chunks: string[] = [];
    for await (const c of llm.streamThink([], 0, "content-only")) chunks.push(c);
    expect(chunks).toEqual(["final answer"]);
  });

  it("streamThink thinking-only mode skips content chunks", async () => {
    const llm = makeLLMWithDeltas([
      { reasoning_content: "reasoning" },
      { content: "answer" },
    ]);
    const chunks: string[] = [];
    for await (const c of llm.streamThink([], 0, "thinking-only")) chunks.push(c);
    expect(chunks).toEqual(["reasoning"]);
  });

  it("streamThink all mode yields both thinking and content", async () => {
    const llm = makeLLMWithDeltas([
      { reasoning_content: "step1" },
      { content: "result" },
    ]);
    const chunks: string[] = [];
    for await (const c of llm.streamThink([], 0, "all")) chunks.push(c);
    expect(chunks).toEqual(["step1", "result"]);
  });

  it("think() assembles full content string (ignores reasoning_content)", async () => {
    const llm = makeLLMWithDeltas([
      { reasoning_content: "internal" },
      { content: "hello " },
      { content: "world" },
    ]);
    const result = await llm.think([]);
    expect(result).toBe("hello world");
  });
});
