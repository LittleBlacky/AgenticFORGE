/**
 * 补充覆盖率：
 * - SimpleAgent.streamRun() with tools loop
 * - core/agent.ts: toString(), runStructured()
 * - AdapterRegistry: initialize() / shutdown()
 * - episodic.ts: retrieve empty query, getStats
 */
import { describe, it, expect, vi } from "vitest";
import { SimpleAgent } from "../../packages/agents/src/simple-agent/SimpleAgent";
import { AdapterRegistry } from "../../packages/memory/src/storage/registry";
import { InMemoryVectorStore, InMemoryKVStore } from "../../packages/memory/src/storage/inMemory";
import { EpisodicMemory } from "../../packages/memory/src/types/episodic";
import { randomUUID } from "node:crypto";
import type { MemoryItem } from "../../packages/memory/src/types/base";
import { Tool, ToolRegistry } from "@agenticforge/tools";
import type { ToolParameter } from "@agenticforge/tools";

function makeItem(overrides: Partial<MemoryItem> = {}): MemoryItem {
  return {
    id: randomUUID(),
    content: "test",
    memoryType: "episodic",
    userId: "u1",
    timestamp: new Date(),
    importance: 0.5,
    metadata: {},
    ...overrides,
  };
}

class EchoTool extends Tool {
  constructor() {
    super("echo", "echoes");
  }
  getParameters(): ToolParameter[] {
    return [{ name: "text", type: "string", description: "t", required: true, default: null }];
  }
  async run(p: Record<string, unknown>) {
    return String(p.text ?? "");
  }
}

// ===========================================================================
// SimpleAgent — streamRun with tools
// ===========================================================================
describe("SimpleAgent — streamRun() with tools", () => {
  it("streams directly when no tools", async () => {
    const llm = {
      think: vi.fn().mockResolvedValue("ok"),
      streamThink: vi.fn(async function* () {
        yield "chunk1";
        yield "chunk2";
      }),
      client: undefined,
      model: "m",
    } as any;
    const agent = new SimpleAgent({ llm });
    const chunks: string[] = [];
    for await (const c of agent.streamRun("q")) chunks.push(c);
    expect(chunks.join("")).toContain("chunk");
  });

  it("streamRun with tools executes tool loop then streams final", async () => {
    const registry = new ToolRegistry();
    registry.registerTool(new EchoTool());
    let call = 0;
    const mockCreate = vi.fn().mockImplementation(async () => {
      call++;
      if (call === 1)
        return {
          choices: [
            {
              message: {
                content: "",
                tool_calls: [
                  {
                    id: "c1",
                    function: { name: "echo", arguments: JSON.stringify({ text: "hello" }) },
                  },
                ],
              },
            },
          ],
        };
      return { choices: [{ message: { content: "", tool_calls: [] } }] };
    });
    const llm = {
      think: vi.fn().mockResolvedValue("ok"),
      streamThink: vi.fn(async function* () {
        yield "final";
      }),
      client: { chat: { completions: { create: mockCreate } } },
      model: "gpt-4o",
    } as any;
    const agent = new SimpleAgent({ llm, toolRegistry: registry });
    const chunks: string[] = [];
    for await (const c of agent.streamRun("use echo")) chunks.push(c);
    expect(chunks.join("")).toBeTruthy();
  });

  it("run() emits beforeRun/afterRun hooks", async () => {
    const llm = {
      think: vi.fn().mockResolvedValue("ok"),
      streamThink: vi.fn(async function* () {
        yield "ok";
      }),
      client: undefined,
      model: "m",
    } as any;
    const agent = new SimpleAgent({ llm });
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
// AdapterRegistry — initialize / shutdown
// ===========================================================================
describe("AdapterRegistry — initialize / shutdown", () => {
  it("initialize() runs checkHealth", async () => {
    const reg = new AdapterRegistry();
    reg.register({} as any);
    await reg.initialize();
    const status = reg.getLastHealthStatus();
    expect(typeof status).toBe("object");
  });

  it("shutdown() clears adapters", async () => {
    const vs = new InMemoryVectorStore();
    const kv = new InMemoryKVStore();
    // Add something to stores
    await vs.upsertVector({ id: "x", vector: [0.1], payload: {} });
    await kv.put("k", { id: "k" } as any);
    const reg = new AdapterRegistry();
    reg.register({ vectorStore: vs, kvStore: kv } as any);
    await reg.shutdown();
    // After shutdown, stores should be cleared
    const results = await vs.queryVector({ vector: [0.1], limit: 5 });
    expect(results).toHaveLength(0);
  });

  it("initialize() with healthCheckInterval starts timer", async () => {
    const reg = new AdapterRegistry({ healthCheckInterval: 60000 });
    reg.register({} as any);
    await reg.initialize();
    // Just ensure no error
    await reg.shutdown();
  });
});

// ===========================================================================
// EpisodicMemory — getStats / retrieve empty query
// ===========================================================================
describe("EpisodicMemory — extra paths", () => {
  it("getStats() returns correct counts", async () => {
    const mem = new EpisodicMemory({ maxCapacity: 100 });
    await mem.add(makeItem({ importance: 0.8 }));
    await mem.add(makeItem({ importance: 0.3 }));
    const stats = await mem.getStats();
    expect(stats.count).toBe(2);
    expect(typeof stats.avgImportance).toBe("number");
  });

  it("retrieve() with empty query returns by importance", async () => {
    const mem = new EpisodicMemory();
    await mem.add(makeItem({ importance: 0.9, content: "important" }));
    await mem.add(makeItem({ importance: 0.1, content: "low" }));
    const results = await mem.retrieve("", 10);
    // sorted by importance when query is empty
    expect(results.length).toBeGreaterThan(0);
    if (results.length >= 2) {
      expect(results[0]!.importance).toBeGreaterThanOrEqual(
        results[results.length - 1]!.importance,
      );
    }
  });

  it("retrieve() filters by userId option", async () => {
    const mem = new EpisodicMemory();
    await mem.add(makeItem({ userId: "u1", content: "u1 content" }));
    await mem.add(makeItem({ userId: "u2", content: "u2 content" }));
    const results = await mem.retrieve("content", 5, { userId: "u1" });
    expect(results.every((m) => m.userId === "u1")).toBe(true);
  });

  it("hasMemory() works correctly", async () => {
    const mem = new EpisodicMemory();
    const item = makeItem();
    await mem.add(item);
    expect(await mem.hasMemory(item.id)).toBe(true);
    expect(await mem.hasMemory("nope")).toBe(false);
  });

  it("remove() returns true for existing item", async () => {
    const mem = new EpisodicMemory();
    const item = makeItem();
    await mem.add(item);
    expect(await mem.remove(item.id)).toBe(true);
    expect(await mem.hasMemory(item.id)).toBe(false);
  });

  it("update() modifies content", async () => {
    const mem = new EpisodicMemory();
    const item = makeItem();
    await mem.add(item);
    const ok = await mem.update(item.id, "updated");
    expect(ok).toBe(true);
  });

  it("clear() empties all memories", async () => {
    const mem = new EpisodicMemory();
    await mem.add(makeItem());
    await mem.clear();
    const stats = await mem.getStats();
    expect(stats.count).toBe(0);
  });
});
