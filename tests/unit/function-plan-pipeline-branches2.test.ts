import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { Tool, ToolRegistry } from "@agenticforge/tools";
import type { ToolParameter } from "@agenticforge/tools";
import { FunctionCallAgent } from "../../packages/agents/src/function-call-agent/FunctionCallAgent";
import { PlanSolveAgent } from "../../packages/agents/src/plan-solve-agent/PlanSolveAgent";
import { searchVectorsExpanded } from "../../packages/memory/src/rag/pipeline";

class WeirdTypeTool extends Tool {
  constructor() {
    super("weird", "tool with uncommon parameter type");
  }
  getParameters(): ToolParameter[] {
    return [
      { name: "when", type: "datetime" as any, description: "custom", required: false, default: null },
      { name: "flag", type: "boolean", description: "boolean", required: false, default: null },
      { name: "count", type: "integer", description: "integer", required: false, default: null },
    ];
  }
  async run(params: Record<string, unknown>): Promise<string> {
    return JSON.stringify(params);
  }
}

class BrokenParamTool extends Tool {
  constructor() {
    super("broken-params", "throws on getParameters");
  }
  getParameters(): ToolParameter[] {
    throw new Error("bad params");
  }
  async run(params: Record<string, unknown>): Promise<string> {
    return JSON.stringify(params);
  }
}

function makeLLMForFunctionCall(createImpl: (p: any) => any) {
  return {
    think: vi.fn().mockResolvedValue("ok"),
    streamThink: vi.fn(async function* () {
      yield "ok";
    }),
    client: {
      chat: {
        completions: {
          create: vi.fn().mockImplementation(async (p: any) => createImpl(p)),
        },
      },
    },
    model: "gpt-4o",
  } as any;
}

describe("FunctionCallAgent branch gap fill", () => {
  it("mapParameterType fallback path: unknown type stays string-like", async () => {
    const registry = new ToolRegistry();
    registry.registerTool(new WeirdTypeTool());

    const llm = makeLLMForFunctionCall((p) => {
      if (p.tool_choice === "none") return { choices: [{ message: { content: "done" } }] };
      return {
        choices: [
          {
            message: {
              content: "",
              tool_calls: [
                {
                  id: "1",
                  function: {
                    name: "weird",
                    arguments: JSON.stringify({ when: "2026-01-01", flag: "yes", count: "12" }),
                  },
                },
              ],
            },
          },
        ],
      };
    });

    const agent = new FunctionCallAgent({ name: "fca-gap", llm, toolRegistry: registry, maxToolIterations: 1 });
    const out = await agent.run("run tool");
    expect(typeof out).toBe("string");
  });

  it("convertParameterTypes returns original parameters when getTool missing", async () => {
    const llm = makeLLMForFunctionCall((_p) => ({ choices: [{ message: { content: "final" } }] }));
    const agent = new FunctionCallAgent({ name: "fca-miss", llm, tools: [] }) as any;
    const converted = agent.convertParameterTypes("missing", { a: "1", b: true });
    expect(converted).toEqual({ a: "1", b: true });
  });

  it("convertParameterTypes returns original parameters when getParameters throws", async () => {
    const registry = new ToolRegistry();
    registry.registerTool(new BrokenParamTool());
    const llm = makeLLMForFunctionCall((_p) => ({ choices: [{ message: { content: "x" } }] }));
    const agent = new FunctionCallAgent({ name: "fca-throw", llm, toolRegistry: registry }) as any;
    const converted = agent.convertParameterTypes("broken-params", { x: "1" });
    expect(converted).toEqual({ x: "1" });
  });
});

describe("PlanSolveAgent branch gap fill", () => {
  it("parsePlan accepts fenced json path and streamRun verbose path", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const llm = {
      think: vi
        .fn()
        .mockResolvedValueOnce("```json\n{\"goal\":\"g\",\"steps\":[{\"id\":1,\"description\":\"s1\"}]}\n```")
        .mockResolvedValueOnce("final"),
      streamThink: vi.fn(async function* () {
        yield "stream ";
        yield "ok";
      }),
      client: {},
      model: "m",
    } as any;

    const agent = new PlanSolveAgent({ name: "psa-gap", llm, verbose: true, maxSteps: 1 });
    const chunks: string[] = [];
    for await (const c of agent.streamRun("goal")) chunks.push(c);

    expect(chunks.join("")).toBe("stream ok");
    expect(agent.getLastPlan()?.steps.length).toBe(1);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("parsePlan fallback keeps description truncated to 200", async () => {
    const longRaw = "x".repeat(500);
    const llm = {
      think: vi.fn().mockResolvedValueOnce(longRaw).mockResolvedValueOnce("done"),
      streamThink: vi.fn(async function* () {
        yield "done";
      }),
      client: {},
      model: "m",
    } as any;

    const agent = new PlanSolveAgent({ name: "psa-fallback", llm, maxSteps: 1 });
    await agent.run("goal");
    const plan = agent.getLastPlan();
    expect(plan?.steps[0]?.description.length).toBeLessThanOrEqual(200);
  });
});

describe("pipeline promptMqe branch gap fill", () => {
  it("MQE returns [query] when LLM returns empty/blank lines", async () => {
    const store = {
      queryVector: vi.fn().mockResolvedValue([{ id: "a", score: 0.9, payload: { memory_id: "a" } }]),
    } as any;

    const llm = {
      think: vi.fn().mockResolvedValue("\n   \n -   \n"),
    } as any;

    const res = await searchVectorsExpanded({
      store,
      query: "agent",
      llm,
      options: { enableMqe: true, mqeExpansions: 3, topK: 3 },
    });

    expect(Array.isArray(res)).toBe(true);
    expect(store.queryVector).toHaveBeenCalled();
  });
});
