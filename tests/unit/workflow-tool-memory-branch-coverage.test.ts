import { describe, it, expect, vi } from "vitest";
import { AsyncToolExecutor } from "../../packages/tools/src/AsyncToolExecutor";
import { ToolChain } from "../../packages/tools/src/ToolChain";
import { ToolRegistry } from "../../packages/tools/src/ToolRegistry";
import { SkillRegistry } from "../../packages/skills/src/SkillRegistry";
import { WorkflowEngine } from "@agenticforge/workflow";
import { MemoryManager } from "../../packages/memory/src/manager";
import { PerceptualMemory } from "../../packages/memory/src/types/perceptual";
import type { MemoryItem } from "../../packages/memory/src/types/base";
import { randomUUID } from "node:crypto";

function makeLLM() {
  return {
    think: vi.fn().mockResolvedValue("ok"),
    streamThink: vi.fn(async function* () {
      yield "ok";
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

describe("AsyncToolExecutor / ToolChain / SkillRegistry branches", () => {
  it("AsyncToolExecutor catch branch handles non-Error throws", async () => {
    const registry = new ToolRegistry();
    registry.registerFunction("bad", "bad", async () => {
      throw "string boom";
    });

    const executor = new AsyncToolExecutor(registry, 2);
    const out = await executor.executeSingle({ id: "1", toolName: "bad", parameters: {} });
    expect(out.error).toBe("string boom");
    expect(out.output).toBe("");
  });

  it("ToolChain returns input when outputKey missing and keeps unresolved placeholders", async () => {
    const registry = new ToolRegistry();
    registry.registerFunction("echo", "echo", async ({ input }: any) => String(input ?? ""));

    const chain = new ToolChain("c", "d");
    chain.addStep("echo", "{unknown}", "k1");
    const out = await chain.execute(registry, "seed");
    expect(out).toBe("{unknown}");
  });

  it("SkillRegistry.describeAll covers non-AgentSkill + triggerHint branch", () => {
    const registry = new SkillRegistry();
    registry.register({
      name: "custom",
      description: "custom desc",
      visible: true,
      triggerHint: "when user asks custom",
      tools: [],
      execute: async () => ({ output: "ok" }),
      describe: () => "ignored",
    } as any);

    const text = registry.describeAll();
    expect(text).toContain("custom");
    expect(text).toContain("触发条件");
  });
});

describe("WorkflowEngine remaining branch lines", () => {
  it("throws scheduler error when a dependency node never marks done", async () => {
    const engine = new WorkflowEngine({ llm: makeLLM() }) as any;

    const original = engine.executeNode.bind(engine);
    let first = true;
    engine.executeNode = async (...args: any[]) => {
      if (first) {
        first = false;
        throw new Error("force rejected promise");
      }
      return original(...args);
    };

    const def = {
      name: "wave-zero",
      nodes: [
        { id: "a", type: "fn", depends: [], executor: async () => "A" },
        { id: "b", type: "fn", depends: ["a"], executor: async () => "B" },
      ],
    } as any;

    await expect(engine.execute(def, "x")).rejects.toThrow("调度异常");
  });

  it("logs warn in verbose mode when node fails", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const engine = new WorkflowEngine({ llm: makeLLM(), verbose: true });
    const def = {
      name: "warn",
      nodes: [
        {
          id: "bad",
          type: "fn",
          depends: [],
          executor: async () => {
            throw new Error("boom");
          },
        },
      ],
    } as any;

    const r = await engine.execute(def, "x");
    expect(r.nodeResults[0]?.status).toBe("failed");
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("logs selected branch in verbose mode", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const engine = new WorkflowEngine({ llm: makeLLM(), verbose: true });
    const def = {
      name: "branch-log",
      nodes: [
        {
          id: "router",
          type: "branch",
          depends: [],
          condition: async () => "left",
          branches: {
            left: [{ id: "l1", type: "fn", depends: [], executor: async () => "L" }],
          },
        },
      ],
    } as any;

    const r = await engine.execute(def, "x");
    expect(r.output).toBe("L");
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('执行分支 "left"'));
    logSpy.mockRestore();
  });
});

describe("MemoryManager / PerceptualMemory extra branches", () => {
  it("MemoryManager returns perceptual store when perceptual enabled", () => {
    const mgr = new MemoryManager({
      enableWorking: false,
      enableEpisodic: false,
      enableSemantic: false,
      enablePerceptual: true,
    }) as any;

    const store = mgr.getStore("perceptual");
    expect(store).toBeDefined();
  });

  it("PerceptualMemory fallback retrieve path sorts by score", async () => {
    const mem = new PerceptualMemory();
    await mem.add(makePerceptualItem({ content: "alpha", importance: 0.2 }));
    await mem.add(makePerceptualItem({ content: "alpha beta", importance: 0.9 }));

    const out = await mem.retrieve("alpha", 2);
    expect(out).toHaveLength(2);
    expect(typeof out[0].metadata.relevance_score).toBe("number");
  });

  it("PerceptualMemory update() hits adapter upsert/blob/kv branches", async () => {
    const vectorStore = {
      upsertVector: vi.fn().mockResolvedValue(undefined),
      queryVector: vi.fn().mockResolvedValue([]),
      deleteVector: vi.fn().mockResolvedValue(undefined),
    } as any;
    const blobStore = {
      putBlob: vi.fn().mockResolvedValue(undefined),
      deleteBlob: vi.fn().mockResolvedValue(undefined),
    } as any;
    const kvStore = {
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue([]),
    } as any;

    const mem = new PerceptualMemory({}, { vectorStore, blobStore, kvStore });
    const item = makePerceptualItem({
      content: "before",
      metadata: { modality: "text", raw_data: "raw1" },
    });
    await mem.add(item);

    const ok = await mem.update(item.id, "after", 0.8, { raw_data: "raw2" });
    expect(ok).toBe(true);
    expect(vectorStore.upsertVector).toHaveBeenCalled();
    expect(blobStore.putBlob).toHaveBeenCalled();
    expect(kvStore.put).toHaveBeenCalled();
  });
});
