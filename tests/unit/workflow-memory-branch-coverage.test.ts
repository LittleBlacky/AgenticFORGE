import { describe, it, expect, vi } from "vitest";
import { WorkflowEngine } from "@agenticforge/workflow";
import type { WorkflowDefinition } from "@agenticforge/workflow";
import { MemoryManager } from "../../packages/memory/src/manager";
import { PerceptualMemory } from "../../packages/memory/src/types/perceptual";
import { randomUUID } from "node:crypto";
import type { MemoryItem } from "../../packages/memory/src/types/base";

function makeLLM(response = "ok") {
  return {
    think: vi.fn().mockResolvedValue(response),
    streamThink: vi.fn(async function* () {
      yield response;
    }),
    client: {},
    model: "mock",
  } as any;
}

function makePerceptualItem(overrides: Partial<MemoryItem> = {}): MemoryItem {
  return {
    id: randomUUID(),
    content: "perceptual content",
    memoryType: "perceptual",
    userId: "u1",
    timestamp: new Date(),
    importance: 0.6,
    metadata: { modality: "text" },
    ...overrides,
  };
}

describe("WorkflowEngine branch coverage (verbose loop)", () => {
  it("logs when loop condition returns false in verbose mode", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const engine = new WorkflowEngine({ llm: makeLLM(), verbose: true });

    const def: WorkflowDefinition = {
      name: "loop-false-log",
      nodes: [
        {
          id: "lp",
          type: "loop",
          depends: [],
          maxIterations: 5,
          condition: async (_ctx, iter) => iter < 1,
          body: [{ id: "s", type: "fn", depends: [], executor: async () => "x" }],
        },
      ],
    };

    await engine.execute(def, "input");

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("condition 返回 false"));
    logSpy.mockRestore();
  });

  it("logs when loop reaches max iterations with condition present", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const engine = new WorkflowEngine({ llm: makeLLM(), verbose: true });

    const def: WorkflowDefinition = {
      name: "loop-max-log",
      nodes: [
        {
          id: "lp",
          type: "loop",
          depends: [],
          maxIterations: 2,
          condition: async () => true,
          body: [{ id: "s", type: "fn", depends: [], executor: async () => "x" }],
        },
      ],
    };

    await engine.execute(def, "input");

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("达到最大迭代次数 2"));
    logSpy.mockRestore();
  });
});

describe("MemoryManager branch coverage", () => {
  it("falls back to first enabled memory type when requested type is disabled", async () => {
    const mgr = new MemoryManager({
      enableWorking: true,
      enableEpisodic: false,
      enableSemantic: false,
      enablePerceptual: false,
    });

    await mgr.addMemory({ content: "x", memoryType: "semantic" as any, importance: 0.7 });
    const stats = await mgr.getMemoryStats();
    expect(stats.memoriesByType.working?.count).toBeGreaterThanOrEqual(1);
  });

  it("throws when no memory types enabled", async () => {
    const mgr = new MemoryManager({
      enableWorking: false,
      enableEpisodic: false,
      enableSemantic: false,
      enablePerceptual: false,
    });

    await expect(mgr.addMemory({ content: "x" })).rejects.toThrow("No memory types enabled");
  });

  it("private getStore throws for disabled perceptual", () => {
    const mgr = new MemoryManager({
      enableWorking: true,
      enableEpisodic: false,
      enableSemantic: false,
      enablePerceptual: false,
    }) as any;

    expect(() => mgr.getStore("perceptual")).toThrow("Perceptual memory not enabled");
  });
});

describe("PerceptualMemory adapter branches", () => {
  it("remove() calls blobStore and kvStore deletion branches", async () => {
    const blobStore = {
      putBlob: vi.fn().mockResolvedValue(undefined),
      deleteBlob: vi.fn().mockResolvedValue(undefined),
    } as any;
    const kvStore = {
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    } as any;

    const mem = new PerceptualMemory({}, { blobStore, kvStore });
    const item = makePerceptualItem();
    await mem.add(item);
    const ok = await mem.remove(item.id);

    expect(ok).toBe(true);
    expect(blobStore.deleteBlob).toHaveBeenCalledWith(item.id);
    expect(kvStore.delete).toHaveBeenCalledWith(item.id);
  });

  it("retrieve() vector adapter path sorts and keeps relevance metadata", async () => {
    const vectorStore = {
      upsertVector: vi.fn().mockResolvedValue(undefined),
      deleteVector: vi.fn().mockResolvedValue(undefined),
      queryVector: vi.fn().mockResolvedValue([
        {
          id: "m2",
          score: 0.4,
          payload: {
            content: "older",
            memoryType: "perceptual",
            userId: "u1",
            importance: 0.2,
            timestamp: new Date(Date.now() - 86400000).toISOString(),
            metadata: { modality: "text" },
          },
        },
        {
          id: "m1",
          score: 0.9,
          payload: {
            content: "newer",
            memoryType: "perceptual",
            userId: "u1",
            importance: 0.9,
            timestamp: new Date().toISOString(),
            metadata: { modality: "text" },
          },
        },
      ]),
    } as any;

    const mem = new PerceptualMemory({}, { vectorStore });
    const out = await mem.retrieve("query", 2, { targetModality: "text" });

    expect(out).toHaveLength(2);
    expect(typeof out[0].metadata.relevance_score).toBe("number");
    expect(out[0].metadata.modality).toBe("text");
  });
});
