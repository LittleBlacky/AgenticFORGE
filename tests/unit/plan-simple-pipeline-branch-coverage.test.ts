import { describe, it, expect, vi } from "vitest";
import { SimpleAgent } from "../../packages/agents/src/simple-agent/SimpleAgent";
import { PlanSolveAgent } from "../../packages/agents/src/plan-solve-agent/PlanSolveAgent";
import {
  buildGraphFromChunks,
  computeGraphSignalsFromPool,
  createRagPipeline,
  type RagChunk,
} from "../../packages/memory/src/rag/pipeline";
import { InMemoryVectorStore } from "../../packages/memory/src/storage/inMemory";

describe("SimpleAgent remaining branches", () => {
  it("run() enters fallback none-tool-choice path when tool loop never yields final content", async () => {
    const createMock = vi
      .fn()
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: "",
              tool_calls: [
                { id: "t1", function: { name: "echo", arguments: JSON.stringify({ input: "x" }) } },
              ],
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: "",
              tool_calls: [
                { id: "t2", function: { name: "echo", arguments: JSON.stringify({ input: "y" }) } },
              ],
            },
          },
        ],
      })
      .mockResolvedValueOnce({ choices: [{ message: { content: "fallback answer" } }] });

    const llm = {
      think: vi.fn(),
      streamThink: vi.fn(async function* () {
        yield "x";
      }),
      client: { chat: { completions: { create: createMock } } },
      model: "gpt-4o",
    } as any;

    const agent = new SimpleAgent({
      name: "simple-fallback",
      llm,
      maxToolIterations: 2,
      tools: [
        {
          name: "echo",
          description: "echo",
          func: async ({ input }: any) => String(input ?? ""),
        } as any,
      ],
    });

    const out = await agent.run("hello");
    expect(out).toBe("fallback answer");
    // last call should be tool_choice none
    expect(createMock).toHaveBeenLastCalledWith(expect.objectContaining({ tool_choice: "none" }));
  });
});

describe("PlanSolveAgent parsePlan branches", () => {
  it("parsePlan fills default id/description when fields missing", () => {
    const llm = { think: vi.fn(), streamThink: vi.fn(async function* () {}) } as any;
    const agent = new PlanSolveAgent({ name: "ps", llm }) as any;

    const plan = agent.parsePlan("goal", JSON.stringify({ steps: [{}, { tool: "search" }] }));
    expect(plan.steps[0].id).toBe(1);
    expect(plan.steps[0].description).toBe("Step 1");
    expect(plan.steps[1].id).toBe(2);
    expect(plan.steps[1].description).toBe("Step 2");
  });

  it("parsePlan extracts json object from wrapped text", () => {
    const llm = { think: vi.fn(), streamThink: vi.fn(async function* () {}) } as any;
    const agent = new PlanSolveAgent({ name: "ps", llm }) as any;
    const raw = "prefix text {\"steps\":[{\"id\":3,\"description\":\"ok\"}]} suffix";
    const plan = agent.parsePlan("goal", raw);
    expect(plan.steps[0].id).toBe(3);
    expect(plan.steps[0].description).toBe("ok");
  });
});

describe("pipeline remaining branches", () => {
  it("buildGraphFromChunks swallows addEntity/addRelationship errors", () => {
    const neo4j = {
      addEntity: vi.fn().mockImplementationOnce(() => {
        throw new Error("doc entity error");
      }).mockImplementationOnce(() => {
        throw new Error("memory entity error");
      }),
      addRelationship: vi.fn().mockImplementation(() => {
        throw new Error("rel error");
      }),
    };

    const chunks: RagChunk[] = [
      {
        id: "m1",
        content: "c1",
        metadata: { doc_id: "d1", source_path: "a/b.md", lang: "zh", start: 0, end: 10 },
      },
    ];

    expect(() => buildGraphFromChunks(neo4j as any, chunks)).not.toThrow();
  });

  it("computeGraphSignalsFromPool handles non-object metadata (toMetadata fallback)", () => {
    const hits = [
      { id: "h1", score: 0.8, metadata: "bad-metadata" as any },
      { id: "h2", score: 0.7, metadata: null as any },
    ];
    const out = computeGraphSignalsFromPool(hits as any);
    expect(typeof out).toBe("object");
    expect(Object.keys(out).length).toBeGreaterThan(0);
  });

  it("createRagPipeline getStats returns empty object branch", async () => {
    const rag = createRagPipeline({ store: new InMemoryVectorStore() });
    const stats = await rag.getStats();
    expect(stats).toEqual({});
  });
});
