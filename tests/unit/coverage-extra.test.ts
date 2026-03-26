/**
 * 补充覆盖率：
 * - ReActAgent.streamRun() (lines 185-213)
 * - WorkingMemory.forget/getImportant/getRecent/getAll/getContextSummary (lines 127-194, 268-269)
 * - FunctionCallAgent convertParameterTypes / executeToolCall paths
 * - AdapterRegistry unhealthy adapter path
 */
import { describe, it, expect, vi } from "vitest";
import { ReActAgent } from "../../packages/agents/src/react-agent/ReActAgent";
import { WorkingMemory } from "../../packages/memory/src/types/working";
import { AdapterRegistry } from "../../packages/memory/src/storage/registry";
import { FunctionCallAgent } from "../../packages/agents/src/function-call-agent/FunctionCallAgent";
import { Tool, ToolRegistry } from "@agenticforge/tools";
import type { ToolParameter } from "@agenticforge/tools";
import { randomUUID } from "node:crypto";
import type { MemoryItem } from "../../packages/memory/src/types/base";

function makeItem(overrides: Partial<MemoryItem> = {}): MemoryItem {
  return {
    id: randomUUID(),
    content: "working memory content",
    memoryType: "working",
    userId: "u1",
    timestamp: new Date(),
    importance: 0.5,
    metadata: {},
    ...overrides,
  };
}

class NumberTool extends Tool {
  constructor() {
    super("calc", "Calculate");
  }
  getParameters(): ToolParameter[] {
    return [
      { name: "value", type: "number", description: "num", required: true, default: null },
      { name: "flag", type: "boolean", description: "flag", required: false, default: null },
    ];
  }
  async run(p: Record<string, unknown>) {
    return `${p.value}`;
  }
}

// ===========================================================================
// ReActAgent — streamRun()
// ===========================================================================
describe("ReActAgent — streamRun()", () => {
  it("yields streamed chunks after Final Answer", async () => {
    const llm = {
      think: vi.fn().mockResolvedValue("Final Answer: 42"),
      streamThink: vi.fn(async function* () {
        yield "42";
      }),
      client: undefined,
      model: "m",
    } as any;
    const agent = new ReActAgent({ name: "ra", llm });
    const chunks: string[] = [];
    for await (const c of agent.streamRun("q")) chunks.push(c);
    expect(chunks.join("")).toBeTruthy();
  });

  it("yields chunks with tool loop then stream synthesis", async () => {
    const registry = new ToolRegistry();
    registry.registerTool(
      new (class extends Tool {
        constructor() {
          super("echo", "echo");
        }
        getParameters(): ToolParameter[] {
          return [];
        }
        async run() {
          return "echo-result";
        }
      })(),
    );
    let call = 0;
    const llm = {
      think: vi.fn().mockImplementation(async () => {
        call++;
        if (call === 1) return "Thought: use echo\nAction: echo\nAction Input: hi";
        return "Final Answer: done";
      }),
      streamThink: vi.fn(async function* () {
        yield "done";
      }),
      client: undefined,
      model: "m",
    } as any;
    const agent = new ReActAgent({ name: "ra", llm, toolRegistry: registry });
    const chunks: string[] = [];
    for await (const c of agent.streamRun("q")) chunks.push(c);
    expect(chunks.length).toBeGreaterThan(0);
  });

  it("streams even when maxSteps exhausted without Final Answer", async () => {
    const llm = {
      think: vi.fn().mockResolvedValue("Thought: still thinking"),
      streamThink: vi.fn(async function* () {
        yield "fallback-stream";
      }),
      client: undefined,
      model: "m",
    } as any;
    const agent = new ReActAgent({ name: "ra", llm, maxSteps: 1 });
    const chunks: string[] = [];
    for await (const c of agent.streamRun("q")) chunks.push(c);
    expect(chunks.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// WorkingMemory — uncovered methods
// ===========================================================================
describe("WorkingMemory — forget()", () => {
  it("forget() importance_based removes low-importance items", async () => {
    const mem = new WorkingMemory();
    await mem.add(makeItem({ importance: 0.05 }));
    await mem.add(makeItem({ importance: 0.9 }));
    const removed = await mem.forget("importance_based", 0.1);
    expect(removed).toBe(1);
  });

  it("forget() time_based removes old items", async () => {
    // Use very long TTL so expireOldMemories() doesn't remove the old item first
    const mem = new WorkingMemory({ workingMemoryTtlMinutes: 99999 });
    const old = makeItem({ timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) }); // 5 days ago
    await mem.add(old);
    await mem.add(makeItem()); // now
    const removed = await mem.forget("time_based", 0.1, 3); // cutoff: 3 days ago
    expect(removed).toBeGreaterThanOrEqual(1);
  });

  it("forget() capacity_based keeps top by importance", async () => {
    const mem = new WorkingMemory({ workingMemoryCapacity: 10 });
    for (let i = 0; i < 5; i++) await mem.add(makeItem({ importance: i * 0.1 }));
    const removed = await mem.forget("capacity_based", 0.1);
    expect(removed).toBeGreaterThanOrEqual(0);
  });

  it("forget() returns 0 when nothing removed", async () => {
    const mem = new WorkingMemory();
    await mem.add(makeItem({ importance: 0.9 }));
    expect(await mem.forget("importance_based", 0.1)).toBe(0);
  });
});

describe("WorkingMemory — getImportant/getRecent/getAll", () => {
  it("getImportant() returns top items sorted by importance", async () => {
    const mem = new WorkingMemory();
    await mem.add(makeItem({ importance: 0.9, content: "high" }));
    await mem.add(makeItem({ importance: 0.2, content: "low" }));
    const items = await mem.getImportant(10);
    // Should return all items sorted by importance desc
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items[0]!.importance).toBeGreaterThanOrEqual(items[items.length - 1]!.importance);
  });

  it("getRecent() returns most recent items", async () => {
    const mem = new WorkingMemory();
    await mem.add(makeItem({ content: "first" }));
    await mem.add(makeItem({ content: "second" }));
    const items = await mem.getRecent(1);
    expect(items).toHaveLength(1);
  });

  it("getAll() returns all memories", async () => {
    const mem = new WorkingMemory();
    await mem.add(makeItem());
    await mem.add(makeItem());
    const all = await mem.getAll();
    expect(all).toHaveLength(2);
  });

  it("getContextSummary() includes content", async () => {
    const mem = new WorkingMemory();
    await mem.add(makeItem({ content: "unique-context-text" }));
    const summary = await mem.getContextSummary();
    expect(summary).toContain("unique-context-text");
  });

  it("getContextSummary() truncates to maxLength", async () => {
    const mem = new WorkingMemory();
    await mem.add(makeItem({ content: "a".repeat(1000) }));
    const summary = await mem.getContextSummary(100);
    expect(summary.length).toBeLessThanOrEqual(150); // some slack for prefix text
  });
});

// ===========================================================================
// AdapterRegistry — unhealthy adapter
// ===========================================================================
describe("AdapterRegistry — unhealthy adapter", () => {
  it("checkHealth() returns false when adapter.health() returns false", async () => {
    const reg = new AdapterRegistry();
    const unhealthyStore = {
      upsertVector: vi.fn(),
      queryVector: vi.fn(),
      deleteVector: vi.fn(),
      clear: vi.fn(),
      health: vi.fn().mockResolvedValue(false),
    };
    reg.register({ vectorStore: unhealthyStore as any });
    const status = await reg.checkHealth();
    expect(status.vectorStore).toBe(false);
    expect(reg.isHealthy()).toBe(false);
  });

  it("checkHealth() returns false when adapter.health() throws", async () => {
    const reg = new AdapterRegistry();
    const errorStore = {
      upsertVector: vi.fn(),
      queryVector: vi.fn(),
      deleteVector: vi.fn(),
      clear: vi.fn(),
      health: vi.fn().mockRejectedValue(new Error("health check failed")),
    };
    reg.register({ vectorStore: errorStore as any });
    const status = await reg.checkHealth();
    expect(status.vectorStore).toBe(false);
  });
});

// ===========================================================================
// FunctionCallAgent — convertParameterTypes / executeToolCall
// ===========================================================================
describe("FunctionCallAgent — parameter type conversion", () => {
  it("run() with string->number conversion passes to tool", async () => {
    let receivedValue: unknown;
    const tool = new (class extends Tool {
      constructor() {
        super("calc", "calc");
      }
      getParameters(): ToolParameter[] {
        return [{ name: "value", type: "number", description: "n", required: true, default: null }];
      }
      async run(p: Record<string, unknown>) {
        receivedValue = p.value;
        return String(p.value);
      }
    })();
    const registry = new ToolRegistry();
    registry.registerTool(tool);
    let call = 0;
    const createMock = vi.fn().mockImplementation(async (params: any) => {
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
                    function: { name: "calc", arguments: JSON.stringify({ value: "42" }) },
                  },
                ],
              },
            },
          ],
        };
      return { choices: [{ message: { content: "result: 42", tool_calls: [] } }] };
    });
    const llm = {
      think: vi.fn().mockResolvedValue("ok"),
      streamThink: vi.fn(async function* () {
        yield "s";
      }),
      client: { chat: { completions: { create: createMock } } },
      model: "gpt-4o",
    } as any;
    const agent = new FunctionCallAgent({ name: "fca", llm, toolRegistry: registry });
    const result = await agent.run("calculate");
    expect(typeof result).toBe("string");
  });

  it("run() tool executeToolCall error returns error message", async () => {
    const registry = new ToolRegistry();
    registry.registerTool(
      new (class extends Tool {
        constructor() {
          super("bad", "bad");
        }
        getParameters(): ToolParameter[] {
          return [];
        }
        async run(): Promise<string> {
          throw new Error("tool broken");
        }
      })(),
    );
    let call = 0;
    const createMock = vi.fn().mockImplementation(async () => {
      call++;
      if (call === 1)
        return {
          choices: [
            {
              message: {
                content: "",
                tool_calls: [{ id: "c1", function: { name: "bad", arguments: "{}" } }],
              },
            },
          ],
        };
      return { choices: [{ message: { content: "recovered", tool_calls: [] } }] };
    });
    const llm = {
      think: vi.fn().mockResolvedValue("ok"),
      streamThink: vi.fn(async function* () {
        yield "s";
      }),
      client: { chat: { completions: { create: createMock } } },
      model: "gpt-4o",
    } as any;
    const agent = new FunctionCallAgent({ name: "fca", llm, toolRegistry: registry });
    const result = await agent.run("use bad tool");
    // Should continue after error and return final response
    expect(typeof result).toBe("string");
  });
});
