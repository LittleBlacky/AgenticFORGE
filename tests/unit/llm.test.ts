/**
 * @agenticforge/core — LLMClient 单元测试
 * 覆盖：toChatMessages, think, streamThink, streamThinkChunked
 */
import { describe, it, expect, vi } from "vitest";
import { LLMClient } from "../../packages/core/src/llm";

function makeStreamChunks(chunks: Array<{ content?: string; reasoning_content?: string }>) {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const c of chunks) {
        yield { choices: [{ delta: c }] };
      }
    },
  };
}

function makeLLMClient(
  streamChunks: Array<{ content?: string; reasoning_content?: string }> = [{ content: "hello" }],
) {
  const createMock = vi.fn().mockResolvedValue(makeStreamChunks(streamChunks));
  const client = new LLMClient({
    model: "gpt-4o",
    apiKey: "sk-test",
    baseURL: "https://api.openai.com/v1",
  });
  // patch internal OpenAI client
  (client as any).client = { chat: { completions: { create: createMock } } };
  return { client, createMock };
}

// ===========================================================================
// Constructor
// ===========================================================================
describe("LLMClient — constructor", () => {
  it("throws when model is missing", () => {
    expect(() => new LLMClient({ apiKey: "k", baseURL: "http://x" })).toThrow();
  });

  it("throws when apiKey is missing", () => {
    expect(() => new LLMClient({ model: "gpt-4o", baseURL: "http://x" })).toThrow();
  });

  it("throws when baseURL is missing", () => {
    expect(() => new LLMClient({ model: "gpt-4o", apiKey: "k" })).toThrow();
  });

  it("constructs successfully with all required fields", () => {
    expect(
      () => new LLMClient({ model: "gpt-4o", apiKey: "k", baseURL: "http://x" }),
    ).not.toThrow();
  });
});

// ===========================================================================
// think()
// ===========================================================================
describe("LLMClient — think()", () => {
  it("returns concatenated content from stream", async () => {
    const { client } = makeLLMClient([{ content: "hel" }, { content: "lo" }]);
    const result = await client.think([{ role: "user", content: "hi" }]);
    expect(result).toBe("hello");
  });

  it("returns empty string when no content chunks", async () => {
    const { client } = makeLLMClient([{}]);
    const result = await client.think([{ role: "user", content: "hi" }]);
    expect(result).toBe("");
  });

  it("calls completions.create with correct model", async () => {
    const { client, createMock } = makeLLMClient([{ content: "ok" }]);
    await client.think([{ role: "user", content: "q" }]);
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gpt-4o", stream: true }),
    );
  });

  it("passes temperature to completions.create", async () => {
    const { client, createMock } = makeLLMClient([{ content: "ok" }]);
    await client.think([{ role: "user", content: "q" }], 0.7);
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ temperature: 0.7 }));
  });

  it("handles tool role messages", async () => {
    const { client, createMock } = makeLLMClient([{ content: "ok" }]);
    await client.think([
      { role: "user", content: "q" },
      { role: "tool", content: "tool result" },
    ]);
    const msgs = createMock.mock.calls[0][0].messages;
    expect(msgs.find((m: any) => m.role === "tool")).toBeDefined();
  });
});

// ===========================================================================
// streamThink()
// ===========================================================================
describe("LLMClient — streamThink()", () => {
  it("yields content chunks by default (content-only mode)", async () => {
    const { client } = makeLLMClient([{ content: "A" }, { content: "B" }]);
    const chunks: string[] = [];
    for await (const c of client.streamThink([{ role: "user", content: "q" }])) {
      chunks.push(c);
    }
    expect(chunks).toEqual(["A", "B"]);
  });

  it("yields only thinking chunks in thinking-only mode", async () => {
    const { client } = makeLLMClient([{ reasoning_content: "think" }, { content: "answer" }]);
    const chunks: string[] = [];
    for await (const c of client.streamThink(
      [{ role: "user", content: "q" }],
      0,
      "thinking-only",
    )) {
      chunks.push(c);
    }
    expect(chunks).toEqual(["think"]);
  });

  it("yields both thinking and content in all mode", async () => {
    const { client } = makeLLMClient([{ reasoning_content: "think" }, { content: "answer" }]);
    const chunks: string[] = [];
    for await (const c of client.streamThink([{ role: "user", content: "q" }], 0, "all")) {
      chunks.push(c);
    }
    expect(chunks).toEqual(["think", "answer"]);
  });

  it("skips reasoning_content in content-only mode", async () => {
    const { client } = makeLLMClient([{ reasoning_content: "think" }, { content: "answer" }]);
    const chunks: string[] = [];
    for await (const c of client.streamThink([{ role: "user", content: "q" }], 0, "content-only")) {
      chunks.push(c);
    }
    expect(chunks).toEqual(["answer"]);
  });

  it("yields nothing for empty delta", async () => {
    const { client } = makeLLMClient([{}]);
    const chunks: string[] = [];
    for await (const c of client.streamThink([{ role: "user", content: "q" }])) {
      chunks.push(c);
    }
    expect(chunks).toHaveLength(0);
  });
});

// ===========================================================================
// streamThinkChunked()
// ===========================================================================
describe("LLMClient — streamThinkChunked()", () => {
  it("yields StreamChunk with type and text", async () => {
    const { client } = makeLLMClient([{ content: "hello" }]);
    const chunks: Array<{ type: string; text: string }> = [];
    for await (const c of client.streamThinkChunked([{ role: "user", content: "q" }])) {
      chunks.push(c);
    }
    expect(chunks).toEqual([{ type: "content", text: "hello" }]);
  });

  it("yields thinking chunk when reasoning_content present", async () => {
    const { client } = makeLLMClient([{ reasoning_content: "thinking..." }]);
    const chunks: Array<{ type: string; text: string }> = [];
    for await (const c of client.streamThinkChunked([{ role: "user", content: "q" }])) {
      chunks.push(c);
    }
    expect(chunks[0]).toEqual({ type: "thinking", text: "thinking..." });
  });

  it("skips chunks with no delta", async () => {
    const createMock = vi.fn().mockResolvedValue({
      [Symbol.asyncIterator]: async function* () {
        yield { choices: [] }; // no delta
        yield { choices: [{ delta: { content: "ok" } }] };
      },
    });
    const { client } = makeLLMClient();
    (client as any).client.chat.completions.create = createMock;
    const chunks: string[] = [];
    for await (const c of client.streamThink([{ role: "user", content: "q" }])) {
      chunks.push(c);
    }
    expect(chunks).toEqual(["ok"]);
  });
});
