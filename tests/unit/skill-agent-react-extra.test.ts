/**
 * 补充覆盖率：
 * - SkillAgent: fallback path (no skill matched) / runSkill() / streamRun()
 * - ReActAgent: exhausted steps without Final Answer path
 */
import { describe, it, expect, vi } from "vitest";
import { SkillAgent } from "../../packages/agents/src/skill-agent/SkillAgent";
import { ReActAgent } from "../../packages/agents/src/react-agent/ReActAgent";
import { AgentSkill } from "../../packages/skills/src/AgentSkill";
import { Tool, ToolRegistry } from "@agenticforge/tools";
import type { ToolParameter } from "@agenticforge/tools";

class NoopSkill extends AgentSkill {
  constructor() {
    super({
      name: "noop",
      description: "Noop skill for testing",
      triggerHint: "noop",
      systemPrompt: "You are a noop assistant.",
    });
  }
}

function makeRoutingLLM(skillName: string, finalAnswer = "skill answer") {
  let call = 0;
  return {
    think: vi.fn().mockImplementation(async () => {
      call++;
      return call === 1 ? skillName : finalAnswer;
    }),
    streamThink: vi.fn(async function* () {
      yield finalAnswer;
    }),
    client: undefined,
    model: "m",
  } as any;
}

function makeFallbackLLM(answer = "fallback answer") {
  return {
    think: vi.fn().mockResolvedValue(answer),
    streamThink: vi.fn(async function* () {
      yield answer;
    }),
    client: undefined,
    model: "m",
  } as any;
}

// ===========================================================================
// SkillAgent — fallback (no skill matched)
// ===========================================================================
describe("SkillAgent — fallback path", () => {
  it("run() falls back to LLM when no skill matched", async () => {
    const llm = makeFallbackLLM("fallback");
    // router returns unknown skill name, so no skill matched
    llm.think.mockImplementation(async () => "unknown_skill_xyz");
    const agent = new SkillAgent({
      name: "sa",
      llm,
      skills: [new NoopSkill()],
    });
    const result = await agent.run("hello");
    expect(typeof result).toBe("string");
  });

  it("runSkill() throws for unknown skill name", async () => {
    const llm = makeFallbackLLM();
    const agent = new SkillAgent({ name: "sa", llm, skills: [new NoopSkill()] });
    await expect(agent.runSkill("nonexistent", "q")).rejects.toThrow();
  });

  it("runSkill() calls skill directly by name", async () => {
    const llm = makeRoutingLLM("noop", "skill result");
    const agent = new SkillAgent({ name: "sa", llm, skills: [new NoopSkill()] });
    const result = await agent.runSkill("noop", "test query");
    expect(result).toHaveProperty("output");
    expect(typeof result.output).toBe("string");
  });
});

describe("SkillAgent — streamRun() fallback", () => {
  it("streams fallback when no skill matched", async () => {
    const llm = makeFallbackLLM("streamed fallback");
    llm.think = vi.fn().mockResolvedValue("unknown_skill");
    const agent = new SkillAgent({ name: "sa", llm, skills: [new NoopSkill()] });
    const chunks: string[] = [];
    for await (const c of agent.streamRun("hello")) chunks.push(c);
    expect(chunks.join("")).toBeTruthy();
  });
});

describe("SkillAgent — routing and history branches", () => {
  class CaptureSkill extends AgentSkill {
    public lastHistoryLen = -1;
    constructor(name: string) {
      super({
        name,
        description: `${name} skill`,
        triggerHint: name,
        systemPrompt: `${name} prompt`,
      });
    }
    override async execute(context: any, _llm: any): Promise<any> {
      this.lastHistoryLen = Array.isArray(context.history) ? context.history.length : -1;
      return { output: `${this.name}-ok` };
    }
  }

  it("routes by startsWith when router returns skill prefix", async () => {
    const llm = {
      think: vi.fn().mockResolvedValue("wea"),
      streamThink: vi.fn(async function* () {
        yield "x";
      }),
      client: undefined,
      model: "m",
    } as any;
    const noop = new CaptureSkill("noop");
    const weather = new CaptureSkill("weather");
    const agent = new SkillAgent({ name: "sa", llm, skills: [noop, weather] });

    const out = await agent.run("forecast please");
    expect(out).toBe("weather-ok");
  });

  it("routes by includes when router output contains skill name", async () => {
    const llm = {
      think: vi.fn().mockResolvedValue("please_use_noop_skill"),
      streamThink: vi.fn(async function* () {
        yield "x";
      }),
      client: undefined,
      model: "m",
    } as any;
    const noop = new CaptureSkill("noop");
    const weather = new CaptureSkill("weather");
    const agent = new SkillAgent({ name: "sa", llm, skills: [noop, weather] });

    const out = await agent.run("do it");
    expect(out).toBe("noop-ok");
  });

  it("stream fallback path includes prior history messages", async () => {
    const llm = {
      think: vi.fn().mockResolvedValue("unknown_skill_xyz"),
      streamThink: vi.fn(async function* () {
        yield "fallback-stream";
      }),
      client: undefined,
      model: "m",
    } as any;
    const noop = new CaptureSkill("noop");
    const weather = new CaptureSkill("weather");
    const agent = new SkillAgent({ name: "sa", llm, skills: [noop, weather] });

    await agent.run("first turn");
    const chunks: string[] = [];
    for await (const c of agent.streamRun("second turn")) chunks.push(c);

    expect(chunks.join("")).toBe("fallback-stream");
    const streamMsgs = llm.streamThink.mock.calls.at(-1)?.[0] as Array<{
      role: string;
      content: string;
    }>;
    expect(streamMsgs.some((m) => m.content.includes("first turn"))).toBe(true);
  });

  it("stream skill path passes history into skill context", async () => {
    const llm = {
      think: vi.fn().mockResolvedValue("weather"),
      streamThink: vi.fn(async function* () {
        yield "x";
      }),
      client: undefined,
      model: "m",
    } as any;
    const weather = new CaptureSkill("weather");
    const noop = new CaptureSkill("noop");
    const agent = new SkillAgent({ name: "sa", llm, skills: [noop, weather] });

    await agent.run("warmup");
    const out: string[] = [];
    for await (const c of agent.streamRun("now route to weather")) out.push(c);

    expect(out.join("")).toBe("weather-ok");
    expect(weather.lastHistoryLen).toBeGreaterThan(0);
  });

  it("run fallback path includes prior history messages", async () => {
    const llm = {
      think: vi.fn().mockResolvedValue("unknown_skill_xyz"),
      streamThink: vi.fn(async function* () {
        yield "x";
      }),
      client: undefined,
      model: "m",
    } as any;
    const noop = new CaptureSkill("noop");
    const weather = new CaptureSkill("weather");
    const agent = new SkillAgent({ name: "sa", llm, skills: [noop, weather] });

    await agent.run("turn-1");
    await agent.run("turn-2");

    const thinkMsgs = llm.think.mock.calls.at(-1)?.[0] as Array<{ role: string; content: string }>;
    expect(thinkMsgs.some((m) => m.content.includes("turn-1"))).toBe(true);
  });

  it("runSkill named path passes history to skill context", async () => {
    const llm = makeFallbackLLM();
    const capture = new CaptureSkill("capture");
    const agent = new SkillAgent({ name: "sa", llm, skills: [capture] });

    await agent.run("init history");
    const result = await agent.runSkill("capture", "do capture", { tag: 1 });

    expect(result.output).toBe("capture-ok");
    expect(capture.lastHistoryLen).toBeGreaterThan(0);
  });
});

// ===========================================================================
// ReActAgent — exhausted max steps without Final Answer
// ===========================================================================
describe("ReActAgent — exhausted steps", () => {
  class SearchTool extends Tool {
    constructor() {
      super("search", "Search for info. Input: search query");
    }
    getParameters(): ToolParameter[] {
      return [{ name: "input", type: "string", description: "q", required: true, default: null }];
    }
    async run(p: Record<string, unknown>) {
      return `result for ${p.input}`;
    }
  }

  it("returns last observation when maxIterations exceeded", async () => {
    const registry = new ToolRegistry();
    registry.registerTool(new SearchTool());
    // Always returns Thought+Action, never Final Answer
    const llm = {
      think: vi
        .fn()
        .mockResolvedValue("Thought: I need to search\nAction: search\nAction Input: query"),
      streamThink: vi.fn(async function* () {
        yield "final";
      }),
      client: undefined,
      model: "m",
    } as any;
    const agent = new ReActAgent({
      name: "ra",
      llm,
      toolRegistry: registry,
      maxIterations: 2,
    });
    // Should not throw — use last observation as final answer
    const chunks: string[] = [];
    for await (const c of agent.streamRun("find something")) chunks.push(c);
    expect(chunks.join("")).toBeTruthy();
  });

  it("verbose mode logs steps", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const registry = new ToolRegistry();
    registry.registerTool(new SearchTool());
    const llm = {
      think: vi
        .fn()
        .mockResolvedValueOnce("Thought: search\nAction: search\nAction Input: q")
        .mockResolvedValueOnce("Final Answer: done"),
      streamThink: vi.fn(async function* () {
        yield "done";
      }),
      client: undefined,
      model: "m",
    } as any;
    const agent = new ReActAgent({
      name: "ra",
      llm,
      toolRegistry: registry,
      maxIterations: 5,
      verbose: true,
    });
    for await (const _ of agent.streamRun("q")) {
    }
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("getSteps() returns steps after run", async () => {
    const registry = new ToolRegistry();
    registry.registerTool(new SearchTool());
    const llm = {
      think: vi
        .fn()
        .mockResolvedValueOnce("Thought: search\nAction: search\nAction Input: topic")
        .mockResolvedValueOnce("Final Answer: result"),
      streamThink: vi.fn(async function* () {
        yield "result";
      }),
      client: undefined,
      model: "m",
    } as any;
    const agent = new ReActAgent({ name: "ra", llm, toolRegistry: registry });
    for await (const _ of agent.streamRun("q")) {
    }
    const steps = agent.getSteps();
    expect(Array.isArray(steps)).toBe(true);
  });
});
