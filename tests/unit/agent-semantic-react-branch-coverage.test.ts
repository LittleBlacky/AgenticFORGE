import { describe, it, expect, vi } from "vitest";
import { Agent } from "../../packages/core/src/agent";
import { z } from "zod";
import { ReActAgent } from "../../packages/agents/src/react-agent/ReActAgent";
import { ToolRegistry } from "@agenticforge/tools";
import { SemanticMemory } from "../../packages/memory/src/types/semantic";
import type { MemoryItem } from "../../packages/memory/src/types/base";
import { randomUUID } from "node:crypto";

class TestAgent extends Agent {
  async run(inputText: string): Promise<string> {
    return this.llm.think([{ role: "user", content: inputText }]);
  }
}

function makeItem(overrides: Partial<MemoryItem> = {}): MemoryItem {
  return {
    id: randomUUID(),
    content: "semantic content",
    memoryType: "semantic",
    userId: "u1",
    timestamp: new Date(),
    importance: 0.5,
    metadata: {},
    ...overrides,
  };
}

describe("core Agent remaining branches", () => {
  it("useHooks registers multiple hooks in one call", async () => {
    const llm = {
      think: vi.fn().mockResolvedValue("ok"),
      streamThink: vi.fn(async function* () { yield "ok"; }),
      client: {},
      model: "m",
    } as any;

    const agent = new TestAgent({ name: "t", llm });
    const events: string[] = [];

    agent.useHooks([
      { name: "h1", events: ["beforeRun"], handle: (ctx: any) => { events.push(ctx.event + "-1"); } },
      { name: "h2", events: ["beforeRun"], handle: (ctx: any) => { events.push(ctx.event + "-2"); } },
    ] as any);

    for await (const _ of agent.streamRun("hello")) {
      // consume
    }

    expect(events).toContain("beforeRun-1");
    expect(events).toContain("beforeRun-2");
  });

  it("runStructured retries on schema validation failure then succeeds", async () => {
    const llm = {
      think: vi
        .fn()
        .mockResolvedValueOnce('{"wrong":"shape"}')
        .mockResolvedValueOnce('{"answer":"ok","score":7}'),
      streamThink: vi.fn(async function* () { yield "ok"; }),
      client: {},
      model: "m",
    } as any;

    const agent = new TestAgent({ name: "t", llm });
    const schema = z.object({ answer: z.string(), score: z.number() });
    const out = await agent.runStructured({ inputText: "q", schema, maxRetries: 2 });

    expect(out.answer).toBe("ok");
    expect(out.score).toBe(7);
  });
});

describe("ReActAgent streamRun non-Error tool exception branch", () => {
  it("streamRun converts string throw to observation error text", async () => {
    const registry = new ToolRegistry();
    registry.registerFunction("boom", "throw", async () => {
      throw "string tool error";
    });

    const llm = {
      think: vi.fn().mockResolvedValueOnce("Action: boom\nAction Input: x").mockResolvedValueOnce("Final Answer: done"),
      streamThink: vi.fn(async function* () {
        yield "FINAL";
      }),
      client: {},
      model: "m",
    } as any;

    const agent = new ReActAgent({ name: "r", llm, toolRegistry: registry, maxSteps: 3 });
    const chunks: string[] = [];
    for await (const c of agent.streamRun("q")) chunks.push(c);

    expect(chunks.join("")).toBe("FINAL");
    const steps = agent.getSteps();
    expect(steps[0]?.observation).toContain("Error: string tool error");
  });
});

describe("SemanticMemory remaining branches", () => {
  it("retrieve uses kvStore fallback path when vector/graph empty", async () => {
    const kvStore = {
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue([
        makeItem({ id: "k1", userId: "u1", metadata: { combined_score: 0.9 } }),
        makeItem({ id: "k2", userId: "u2", metadata: { combined_score: 0.7 } }),
      ]),
    } as any;
    const vectorStore = {
      upsertVector: vi.fn().mockResolvedValue(undefined),
      deleteVector: vi.fn().mockResolvedValue(undefined),
      queryVector: vi.fn().mockResolvedValue([]),
    } as any;
    const graphStore = {
      upsertEntities: vi.fn().mockResolvedValue(undefined),
      upsertRelations: vi.fn().mockResolvedValue(undefined),
      deleteByMemoryId: vi.fn().mockResolvedValue(undefined),
      // return an unrelated graph id so merged vector+graph remains empty,
      // forcing fallback to kvStore.list branch
      queryGraph: vi.fn().mockResolvedValue([{ entityId: "g1", score: 0.8 }]),
    } as any;

    const mem = new SemanticMemory({}, { kvStore, vectorStore, graphStore });
    const out = await mem.retrieve("query", 5, { userId: "u1" });

    expect(out).toHaveLength(1);
    expect(out[0].userId).toBe("u1");
  });

  it("merge adapter results sorts multiple vector entries and normalizes empty userId", async () => {
    const vectorStore = {
      upsertVector: vi.fn().mockResolvedValue(undefined),
      deleteVector: vi.fn().mockResolvedValue(undefined),
      queryVector: vi.fn().mockResolvedValue([
        {
          id: "v1",
          score: 0.4,
          payload: { content: "c1", memoryType: "semantic", importance: 0.2, metadata: {} },
        },
        {
          id: "v2",
          score: 0.9,
          payload: { content: "c2", memoryType: "semantic", importance: 0.9, metadata: {} },
        },
      ]),
    } as any;
    const graphStore = {
      upsertEntities: vi.fn().mockResolvedValue(undefined),
      upsertRelations: vi.fn().mockResolvedValue(undefined),
      deleteByMemoryId: vi.fn().mockResolvedValue(undefined),
      queryGraph: vi.fn().mockResolvedValue([]),
    } as any;

    const mem = new SemanticMemory({}, { vectorStore, graphStore });
    const out = await mem.retrieve("query", 2);

    expect(out).toHaveLength(2);
    expect(out[0].id).toBe("v2");
    expect(out[1].id).toBe("v1");
    expect(typeof out[0].userId).toBe("string");
  });
});
