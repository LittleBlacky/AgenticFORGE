import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { SimpleAgent } from "../../packages/agents/src/simple-agent/SimpleAgent";
import { FunctionCallAgent } from "../../packages/agents/src/function-call-agent/FunctionCallAgent";
import { PlanSolveAgent } from "../../packages/agents/src/plan-solve-agent/PlanSolveAgent";
import { Tool } from "@agenticforge/tools";
import type { ToolParameter } from "@agenticforge/tools";
import { createRagPipeline, searchVectorsExpanded } from "../../packages/memory/src/rag/pipeline";
import { InMemoryVectorStore } from "../../packages/memory/src/storage/inMemory";

class EchoTool extends Tool {
  constructor() {
    super("echo", "echo input");
  }
  getParameters(): ToolParameter[] {
    return [{ name: "input", type: "string", description: "input", required: false, default: null }];
  }
  async run(params: Record<string, unknown>): Promise<string> {
    return String(params.input ?? "");
  }
}

describe("SimpleAgent history + non-Error tool failure branches", () => {
  it("run and streamRun include history-mapped messages and non-Error tool failure", async () => {
    let nonStreamCalls = 0;
    const llm = {
      think: vi.fn(),
      streamThink: vi.fn(async function* () {
        yield "stream-final";
      }),
      client: {
        chat: {
          completions: {
            create: vi.fn().mockImplementation(async (params: any) => {
              if (params.stream) {
                return (async function* () {
                  yield { choices: [{ delta: { content: "S" } }] };
                  yield { choices: [{ delta: { content: "T" } }] };
                })();
              }
              nonStreamCalls++;
              if (nonStreamCalls <= 2) {
                return {
                  choices: [
                    {
                      message: {
                        content: "",
                        tool_calls: [
                          { id: `tc-${nonStreamCalls}`, function: { name: "boom", arguments: "{}" } },
                        ],
                      },
                    },
                  ],
                };
              }
              return { choices: [{ message: { content: "fallback" } }] };
            }),
          },
        },
      },
      model: "gpt-4o",
    } as any;

    const agent = new SimpleAgent({
      name: "simple-branch4",
      llm,
      maxToolIterations: 1,
      tools: [
        {
          name: "boom",
          description: "throw string",
          func: async () => {
            throw "tool string error";
          },
          schema: z.object({}),
        } as any,
      ],
    });

    agent.addMessage({ role: "user", content: "prev-user" } as any);
    agent.addMessage({ role: "assistant", content: "prev-assistant" } as any);

    const out = await agent.run("run-now");
    expect(out).toBe("fallback");

    const streamed: string[] = [];
    for await (const c of agent.streamRun("stream-now")) streamed.push(c);
    expect(streamed.join("")).toBe("ST");
  });
});

describe("FunctionCallAgent constructor tools registration branches", () => {
  it("registers both Tool instance and function tool from params.tools", () => {
    const llm = {
      think: vi.fn().mockResolvedValue("ok"),
      streamThink: vi.fn(async function* () {
        yield "ok";
      }),
      client: {},
      model: "m",
    } as any;

    const agent = new FunctionCallAgent({
      name: "fca-tools-ctor",
      llm,
      tools: [
        new EchoTool(),
        {
          name: "fn-tool",
          description: "function tool",
          func: async ({ input }: any) => String(input ?? ""),
          schema: z.object({ input: z.string().optional() }),
        } as any,
      ],
    });

    const names = agent.listTools();
    expect(names).toContain("echo");
    expect(names).toContain("fn-tool");
  });
});

describe("PlanSolveAgent catch String(e) branches", () => {
  it("run catches string throw from executor path", async () => {
    const llm = {
      think: vi
        .fn()
        .mockResolvedValueOnce(JSON.stringify({ steps: [{ id: 1, description: "s1", tool: "boom" }] }))
        .mockResolvedValueOnce("done"),
      streamThink: vi.fn(async function* () {
        yield "done";
      }),
      client: {},
      model: "m",
    } as any;

    const agent = new PlanSolveAgent({ name: "ps-run-str", llm }) as any;
    agent.executor.execute = vi.fn().mockRejectedValue("string failure");

    const out = await agent.run("goal");
    expect(out).toBe("done");
  });

  it("streamRun catches string throw from executor path", async () => {
    const llm = {
      think: vi.fn().mockResolvedValueOnce(JSON.stringify({ steps: [{ id: 1, description: "s1", tool: "boom" }] })),
      streamThink: vi.fn(async function* () {
        yield "Z";
      }),
      client: {},
      model: "m",
    } as any;

    const agent = new PlanSolveAgent({ name: "ps-stream-str", llm }) as any;
    agent.executor.execute = vi.fn().mockRejectedValue("string failure");

    const chunks: string[] = [];
    for await (const c of agent.streamRun("goal")) chunks.push(c);
    expect(chunks.join("")).toBe("Z");
  });
});

describe("pipeline createRagPipeline.searchAdvanced branch", () => {
  it("calls searchAdvanced() path", async () => {
    const store = new InMemoryVectorStore();
    const rag = createRagPipeline({
      store,
      embedder: {
        encode: async (_: string | string[]) => {
          return [new Array(384).fill(0.1)];
        },
      } as any,
    });

    await store.upsertVector({
      id: "m1",
      vector: new Array(384).fill(0.1),
      payload: { memory_id: "m1", memory_type: "rag_chunk", is_rag_data: true, data_source: "rag_pipeline", rag_namespace: "default", content: "x" },
    });

    const out = await rag.searchAdvanced("query", 3, false, false);
    expect(Array.isArray(out)).toBe(true);
  });

  it("executes promptHyde catch branch when llm fails", async () => {
    const res = await searchVectorsExpanded({
      store: {
        queryVector: vi.fn().mockResolvedValue([]),
      } as any,
      query: "q",
      llm: { think: vi.fn().mockRejectedValue(new Error("hyde fail")) } as any,
      options: { enableHyde: true, topK: 3 },
    });
    expect(Array.isArray(res)).toBe(true);
  });
});
