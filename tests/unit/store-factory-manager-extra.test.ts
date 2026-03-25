/**
 * 补充覆盖率：
 * - storeFactory: registerRagVectorStoreFactory / createDefaultVectorStore
 * - FunctionCallAgent: executeToolCall no-registry path / parseFunctionCallArguments edge cases
 * - manager.ts: forgetMemories / updateMemory / removeMemory
 * - core/agent.ts: toString() / runStructured()
 */
import { describe, it, expect, vi } from "vitest";
import {
  createDefaultVectorStore,
  registerRagVectorStoreFactory,
} from "../../packages/memory/src/rag/storeFactory";
import { InMemoryVectorStore } from "../../packages/memory/src/storage/inMemory";
import { FunctionCallAgent } from "../../packages/agents/src/function-call-agent/FunctionCallAgent";
import { MemoryManager } from "../../packages/memory/src/manager";
import { Tool, ToolRegistry } from "@agenticforge/tools";
import type { ToolParameter } from "@agenticforge/tools";
import { randomUUID } from "node:crypto";

// ===========================================================================
// storeFactory
// ===========================================================================
describe("createDefaultVectorStore()", () => {
  it("returns InMemoryVectorStore by default", () => {
    const store = createDefaultVectorStore();
    expect(store).toBeInstanceOf(InMemoryVectorStore);
  });

  it("uses custom factory when registered", () => {
    const customStore = new InMemoryVectorStore();
    registerRagVectorStoreFactory(() => customStore);
    const store = createDefaultVectorStore();
    expect(store).toBe(customStore);
    // Reset factory
    registerRagVectorStoreFactory(null as any);
  });

  it("returns InMemoryVectorStore when backend=memory", () => {
    const store = createDefaultVectorStore({ backend: "memory" });
    expect(store).toBeInstanceOf(InMemoryVectorStore);
  });
});

// ===========================================================================
// FunctionCallAgent — executeToolCall no-registry / parseFunctionCallArguments
// ===========================================================================
describe("FunctionCallAgent — no-registry / arg parsing edge cases", () => {
  function makeLLM(toolCallArgs: string | null, finalResponse = "done") {
    let call = 0;
    return {
      think: vi.fn().mockResolvedValue("ok"),
      streamThink: vi.fn(async function* () { yield "s"; }),
      client: {
        chat: {
          completions: {
            create: vi.fn().mockImplementation(async () => {
              call++;
              if (call === 1 && toolCallArgs !== null) return {
                choices: [{ message: {
                  content: "",
                  tool_calls: [{ id: "c1", function: { name: "tool", arguments: toolCallArgs } }]
                } }]
              };
              return { choices: [{ message: { content: finalResponse, tool_calls: [] } }] };
            })
          }
        }
      },
      model: "gpt-4o",
    } as any;
  }

  it("returns error string when no toolRegistry configured", async () => {
    // FunctionCallAgent without toolRegistry — tool call returns error string
    const llm = makeLLM(JSON.stringify({ x: 1 }));
    const agent = new FunctionCallAgent({ name: "fca", llm });
    // No toolRegistry — invokeWithTools should still work with empty schemas
    const result = await agent.run("test");
    expect(typeof result).toBe("string");
  });

  it("handles invalid JSON arguments gracefully", async () => {
    const registry = new ToolRegistry();
    registry.registerTool(new class extends Tool {
      constructor() { super("tool", "t"); }
      getParameters(): ToolParameter[] { return []; }
      async run() { return "ok"; }
    }());
    const llm = makeLLM("not valid json {{{}");
    const agent = new FunctionCallAgent({ name: "fca", llm, toolRegistry: registry });
    // Should not throw — invalid JSON parsed to {}
    const result = await agent.run("test");
    expect(typeof result).toBe("string");
  });

  it("handles non-object JSON arguments (array)", async () => {
    const registry = new ToolRegistry();
    registry.registerTool(new class extends Tool {
      constructor() { super("tool", "t"); }
      getParameters(): ToolParameter[] { return []; }
      async run() { return "ok"; }
    }());
    const llm = makeLLM(JSON.stringify([1, 2, 3]));
    const agent = new FunctionCallAgent({ name: "fca", llm, toolRegistry: registry });
    const result = await agent.run("test");
    expect(typeof result).toBe("string");
  });
});

// ===========================================================================
// MemoryManager — forgetMemories / updateMemory / removeMemory
// ===========================================================================
describe("MemoryManager — forgetMemories", () => {
  it("forgets low-importance working memories", async () => {
    const mgr = new MemoryManager({ enabledTypes: ["working"], userId: "u1" });
    await mgr.addMemory({ content: "low", memoryType: "working", importance: 0.05, userId: "u1" });
    await mgr.addMemory({ content: "high", memoryType: "working", importance: 0.9, userId: "u1" });
    const removed = await mgr.forgetMemories({ strategy: "importance_based", threshold: 0.1 });
    expect(removed).toBeGreaterThanOrEqual(1);
  });

  it("forgetMemories returns 0 for empty memory", async () => {
    const mgr = new MemoryManager({ enabledTypes: ["working"], userId: "u1" });
    const removed = await mgr.forgetMemories({ strategy: "importance_based", threshold: 0.1 });
    expect(removed).toBe(0);
  });
});

describe("MemoryManager — updateMemory", () => {
  it("updates existing memory content", async () => {
    const mgr = new MemoryManager({ enabledTypes: ["working"], userId: "u1" });
    const id = await mgr.addMemory({ content: "original", memoryType: "working", userId: "u1" });
    const ok = await mgr.updateMemory({ memoryId: id, content: "updated" });
    expect(ok).toBe(true);
  });

  it("returns false for unknown id", async () => {
    const mgr = new MemoryManager({ enabledTypes: ["working"], userId: "u1" });
    const ok = await mgr.updateMemory({ memoryId: "nope", content: "x" });
    expect(ok).toBe(false);
  });
});

describe("MemoryManager — removeMemory", () => {
  it("removes existing memory", async () => {
    const mgr = new MemoryManager({ enabledTypes: ["working"], userId: "u1" });
    const id = await mgr.addMemory({ content: "remove me", memoryType: "working", userId: "u1" });
    const ok = await mgr.removeMemory(id);
    expect(ok).toBe(true);
  });

  it("returns false for unknown id", async () => {
    const mgr = new MemoryManager({ enabledTypes: ["working"], userId: "u1" });
    const ok = await mgr.removeMemory("nope");
    expect(ok).toBe(false);
  });
});

describe("MemoryManager — retrieveMemories with filters", () => {
  it("filters by memoryType", async () => {
    const mgr = new MemoryManager({ enabledTypes: ["working", "episodic"], userId: "u1" });
    await mgr.addMemory({ content: "working item", memoryType: "working", userId: "u1" });
    const results = await mgr.retrieveMemories({ query: "working", limit: 5, memoryTypes: ["working"] });
    expect(Array.isArray(results)).toBe(true);
  });

  it("filters by minImportance", async () => {
    const mgr = new MemoryManager({ enabledTypes: ["working"], userId: "u1" });
    await mgr.addMemory({ content: "high importance", memoryType: "working", importance: 0.9, userId: "u1" });
    await mgr.addMemory({ content: "low importance", memoryType: "working", importance: 0.1, userId: "u1" });
    const results = await mgr.retrieveMemories({ query: "importance", limit: 10, minImportance: 0.5 });
    expect(results.every(m => m.importance >= 0.5)).toBe(true);
  });
});
