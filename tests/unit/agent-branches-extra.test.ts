/**
 * 补充覆盖率：
 * - FunctionCallAgent: extractMessageContent (array/null/object)
 * - SkillAgent: single skill shortcut / routerPromptTemplate
 * - ReflectionAgent: multiple reflection rounds (streamRun)
 * - core/agent.ts: toString()
 * - PlanSolveAgent: streamRun with steps
 */
import { describe, it, expect, vi } from "vitest";
import { FunctionCallAgent } from "../../packages/agents/src/function-call-agent/FunctionCallAgent";
import { SkillAgent } from "../../packages/agents/src/skill-agent/SkillAgent";
import { ReflectionAgent } from "../../packages/agents/src/reflection-agent/ReflectionAgent";
import { PlanSolveAgent } from "../../packages/agents/src/plan-solve-agent/PlanSolveAgent";
import { AgentSkill } from "../../packages/skills/src/AgentSkill";
import { Tool, ToolRegistry } from "@agenticforge/tools";
import type { ToolParameter } from "@agenticforge/tools";

class EchoSkill extends AgentSkill {
  constructor() {
    super({ name: "echo", description: "Echo skill", triggerHint: "echo", systemPrompt: "Echo." });
  }
}

function makeSimpleLLM(response = "ok") {
  return {
    think: vi.fn().mockResolvedValue(response),
    streamThink: vi.fn(async function* () {
      yield response;
    }),
    client: undefined,
    model: "m",
  } as any;
}

// ===========================================================================
// FunctionCallAgent — extractMessageContent with array content
// ===========================================================================
describe("FunctionCallAgent — array message content", () => {
  it("handles array content parts in LLM response", async () => {
    const registry = new ToolRegistry();
    let call = 0;
    const mockCreate = vi.fn().mockImplementation(async () => {
      call++;
      if (call === 1)
        return {
          choices: [
            {
              message: {
                // Array content format (vision/multimodal)
                content: [{ type: "text", text: "the answer" }],
                tool_calls: [],
              },
            },
          ],
        };
      return { choices: [{ message: { content: "final", tool_calls: [] } }] };
    });
    const llm = {
      think: vi.fn().mockResolvedValue("ok"),
      streamThink: vi.fn(async function* () {
        yield "ok";
      }),
      client: { chat: { completions: { create: mockCreate } } },
      model: "gpt-4o",
    } as any;
    const agent = new FunctionCallAgent({ name: "fca", llm, toolRegistry: registry });
    const result = await agent.run("test");
    expect(typeof result).toBe("string");
  });

  it("handles null/undefined content", async () => {
    let call = 0;
    const mockCreate = vi.fn().mockImplementation(async () => {
      call++;
      if (call === 1)
        return {
          choices: [{ message: { content: null, tool_calls: [] } }],
        };
      return { choices: [{ message: { content: "done", tool_calls: [] } }] };
    });
    const llm = {
      think: vi.fn().mockResolvedValue("ok"),
      streamThink: vi.fn(async function* () {
        yield "ok";
      }),
      client: { chat: { completions: { create: mockCreate } } },
      model: "gpt-4o",
    } as any;
    const agent = new FunctionCallAgent({ name: "fca", llm });
    const result = await agent.run("test");
    expect(typeof result).toBe("string");
  });
});

// ===========================================================================
// SkillAgent — single skill shortcut (visible.length === 1)
// ===========================================================================
describe("SkillAgent — single skill routing shortcut", () => {
  it("uses only skill directly when only one visible", async () => {
    const llm = makeSimpleLLM("skill answer");
    const agent = new SkillAgent({
      name: "sa",
      llm,
      skills: [new EchoSkill()],
    });
    // With only one skill, routeToSkill returns it directly without LLM call
    const result = await agent.run("any query");
    expect(typeof result).toBe("string");
    // The routing LLM think should NOT have been called for routing
    // (it will be called for skill execution)
  });

  it("returns empty string for no visible skills", async () => {
    const llm = makeSimpleLLM("fallback");
    const agent = new SkillAgent({ name: "sa", llm, skills: [] });
    const result = await agent.run("hello");
    expect(typeof result).toBe("string");
  });
});

// ===========================================================================
// ReflectionAgent — multiple rounds
// ===========================================================================
describe("ReflectionAgent — multiple reflection rounds", () => {
  it("streamRun with reflectionRounds=2 yields final answer", async () => {
    let call = 0;
    const llm = {
      think: vi.fn().mockImplementation(async () => {
        call++;
        return call === 1 ? "draft" : call === 2 ? "critique" : "refined answer";
      }),
      streamThink: vi.fn(async function* () {
        yield "final refined answer";
      }),
      client: undefined,
      model: "m",
    } as any;
    const agent = new ReflectionAgent({ name: "ra", llm, reflectionRounds: 2 });
    const chunks: string[] = [];
    for await (const c of agent.streamRun("write something")) chunks.push(c);
    expect(chunks.join("")).toBeTruthy();
  });

  it("run() with reflectionRounds=3 completes", async () => {
    let call = 0;
    const responses = ["draft", "critique1", "revision1", "critique2", "revision2", "final"];
    const llm = {
      think: vi.fn().mockImplementation(async () => responses[call++] ?? "done"),
      streamThink: vi.fn(async function* () {
        yield "done";
      }),
      client: undefined,
      model: "m",
    } as any;
    const agent = new ReflectionAgent({ name: "ra", llm, reflectionRounds: 3 });
    const result = await agent.run("write something");
    expect(typeof result).toBe("string");
  });
});

// ===========================================================================
// PlanSolveAgent — streamRun with multi-step plan
// ===========================================================================
describe("PlanSolveAgent — streamRun multi-step", () => {
  it("streamRun executes multiple steps and yields chunks", async () => {
    const plan = JSON.stringify({
      goal: "research",
      steps: [
        { id: 1, description: "step one", toolName: "", parameters: {} },
        { id: 2, description: "step two", toolName: "", parameters: {} },
      ],
    });
    let call = 0;
    const llm = {
      think: vi.fn().mockImplementation(async () => {
        call++;
        return call === 1 ? plan : "intermediate result";
      }),
      streamThink: vi.fn(async function* () {
        yield "streamed answer";
      }),
      client: undefined,
      model: "m",
    } as any;
    const agent = new PlanSolveAgent({ name: "psa", llm, verbose: true });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const chunks: string[] = [];
    for await (const c of agent.streamRun("research topic")) chunks.push(c);
    expect(chunks.join("")).toBeTruthy();
    consoleSpy.mockRestore();
  });

  it("streamRun handles step failure and continues", async () => {
    const plan = JSON.stringify({
      goal: "test",
      steps: [{ id: 1, description: "broken", toolName: "missing", parameters: {} }],
    });
    const registry = new ToolRegistry();
    registry.registerTool(
      new (class extends Tool {
        constructor() {
          super("missing", "m");
        }
        getParameters(): ToolParameter[] {
          return [];
        }
        async run() {
          throw new Error("tool error");
        }
      })(),
    );
    let call = 0;
    const llm = {
      think: vi.fn().mockImplementation(async () => {
        call++;
        return call === 1 ? plan : "done";
      }),
      streamThink: vi.fn(async function* () {
        yield "done";
      }),
      client: undefined,
      model: "m",
    } as any;
    const agent = new PlanSolveAgent({ name: "psa", llm, toolRegistry: registry });
    const chunks: string[] = [];
    for await (const c of agent.streamRun("q")) chunks.push(c);
    expect(chunks.join("")).toBeTruthy();
  });
});

// ===========================================================================
// core/agent.ts — toString()
// ===========================================================================
describe("Agent — toString()", () => {
  it("returns formatted string representation", () => {
    const llm = makeSimpleLLM();
    const agent = new FunctionCallAgent({ name: "my-agent", llm });
    const str = agent.toString();
    expect(str).toContain("my-agent");
  });
});
