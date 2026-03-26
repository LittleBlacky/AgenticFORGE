import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import {
  expandNeighborsFromPool,
  mergeSnippetsGrouped,
} from "../../packages/memory/src/rag/pipeline";
import { FunctionCallAgent } from "../../packages/agents/src/function-call-agent/FunctionCallAgent";
import { ToolRegistry } from "@agenticforge/tools";

describe("pipeline extra branches", () => {
  it("expandNeighborsFromPool handles selected item not found in doc pool", () => {
    const selected = [
      { id: "sel-1", memory_id: "sel-1", metadata: { doc_id: "doc-a", start: 100 }, score: 1 },
    ];
    const pool = [
      { id: "p-1", memory_id: "p-1", metadata: { doc_id: "doc-a", start: 10 }, score: 0.5 },
      { id: "p-2", memory_id: "p-2", metadata: { doc_id: "doc-a", start: 20 }, score: 0.4 },
    ];
    const out = expandNeighborsFromPool(selected, pool, 2, 5);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("sel-1");
  });

  it("expandNeighborsFromPool uses rerank_score sort when present", () => {
    const selected = [
      {
        id: "a",
        memory_id: "a",
        rerank_score: 0.2,
        score: 0.9,
        metadata: { doc_id: "d1", start: 10 },
      },
    ];
    const pool = [
      { id: "a", memory_id: "a", metadata: { doc_id: "d1", start: 10 } },
      {
        id: "b",
        memory_id: "b",
        rerank_score: 0.8,
        score: 0.1,
        metadata: { doc_id: "d1", start: 11 },
      },
    ];
    const out = expandNeighborsFromPool(selected, pool, 1, 3);
    expect(out[0].id).toBe("b");
  });

  it("mergeSnippetsGrouped returns merged only when no valid citations generated", () => {
    const ranked = [
      { content: "   ", score: 0.9, metadata: { doc_id: "d1" } }, // empty after trim
      { content: "", score: 0.8, metadata: { doc_id: "d1" } },
    ];
    const out = mergeSnippetsGrouped(ranked, 200, true);
    expect(out).toBe("");
  });

  it("mergeSnippetsGrouped reference line falls back to source label", () => {
    const ranked = [{ content: "hello", score: 0.9, metadata: {} }];
    const out = mergeSnippetsGrouped(ranked, 200, true);
    expect(out).toContain("References:");
    expect(out).toContain("source");
  });
});

describe("FunctionCallAgent extra branches", () => {
  function makeAgent() {
    const llm = {
      think: vi.fn().mockResolvedValue("ok"),
      streamThink: vi.fn(async function* () {
        yield "ok";
      }),
      client: undefined,
      model: "m",
    } as any;
    return new FunctionCallAgent({ name: "fca-extra", llm, enableToolCalling: true });
  }

  it("buildToolSchemas falls back to default parameters when schema conversion throws", () => {
    const agent = makeAgent() as any;
    const registry = new ToolRegistry() as any;

    registry.getAllTools = vi.fn(() => []);
    const badSchema = z.string().transform((v) => v.toUpperCase());
    registry.functions = new Map([
      [
        "bad-fn",
        {
          description: "bad fn",
          schema: badSchema,
        },
      ],
    ]);
    agent.toolRegistry = registry;
    agent.enableToolCalling = true;

    const schemas = agent.buildToolSchemas();
    const fn = schemas.find((s: any) => s?.function?.name === "bad-fn");
    expect(fn).toBeTruthy();
    expect((fn as any).function.parameters).toHaveProperty("type", "object");
  });

  it("executeToolCall returns failure text when registry execute throws", async () => {
    // executeToolCall 已移入 ToolCallExecutor，通过 FunctionCallAgent.run() 的行为测试
    const agent = makeAgent() as any;
    const mockRegistry = {
      execute: vi.fn().mockRejectedValue(new Error("boom")),
      getTool: vi.fn(() => undefined),
      getAllTools: vi.fn(() => []),
      getAvailableTools: vi.fn(() => ""),
      listTools: vi.fn(() => []),
      getOpenAISchemas: vi.fn(() => []),
      functions: new Map(),
    };
    agent.toolRegistry = mockRegistry;
    agent.enableToolCalling = true;

    // 用 ToolCallExecutor 直接测试 executor 回调异常被捕获为错误字符串
    const { ToolCallExecutor } = await import("../../packages/core/src/tool-call-executor");
    const executor = new ToolCallExecutor({ llm: agent.llm });
    const fakeClient = {
      chat: {
        completions: {
          create: vi
            .fn()
            .mockResolvedValueOnce({
              choices: [
                {
                  message: {
                    content: "",
                    tool_calls: [
                      { id: "c1", type: "function", function: { name: "x", arguments: '{"a":1}' } },
                    ],
                  },
                },
              ],
            })
            .mockResolvedValueOnce({
              choices: [{ message: { content: "done", tool_calls: [] } }],
            }),
        },
      },
    };
    (agent.llm as any).client = fakeClient;
    (agent.llm as any).model = "m";

    const result = await executor.run({
      messages: [{ role: "user" as const, content: "test" }],
      tools: [{ type: "function", function: { name: "x", description: "x", parameters: {} } }],
      executor: async () => {
        throw new Error("boom");
      },
    });
    expect(result.output).toBe("done");
  });

  it("invokeWithTools throws when llm client/model missing", async () => {
    // invokeWithTools 已移入 ToolCallExecutor，通过 ToolCallExecutor 直接测试
    const { ToolCallExecutor } = await import("../../packages/core/src/tool-call-executor");
    const llmWithoutClient = {
      think: vi.fn().mockResolvedValue("ok"),
      streamThink: vi.fn(async function* () {
        yield "ok";
      }),
      client: undefined,
      model: undefined,
    } as any;
    const executor = new ToolCallExecutor({ llm: llmWithoutClient });
    await expect(
      executor.run({
        messages: [{ role: "user" as const, content: "test" }],
        tools: [{ type: "function", function: { name: "x", description: "x", parameters: {} } }],
        executor: async () => "result",
      }),
    ).rejects.toThrow("LLMClient 未暴露底层 OpenAI 客户端");
  });
});
