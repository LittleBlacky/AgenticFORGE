/**
 * @agenticforge/skills — AgentSkill tool-calling 路径测试
 */
import { describe, it, expect, vi } from "vitest";
import { AgentSkill } from "../../packages/skills/src/AgentSkill";
import { Tool, ToolRegistry } from "@agenticforge/tools";
import type { ToolParameter } from "@agenticforge/tools";
import type { SkillContext } from "../../packages/skills/src/types";

class EchoTool extends Tool {
  constructor() { super("echo", "Echoes the input text back"); }
  getParameters(): ToolParameter[] {
    return [{ name: "text", type: "string", description: "text to echo", required: true, default: null }];
  }
  async run(p: Record<string, unknown>): Promise<string> {
    return String(p.text ?? "");
  }
}

function makeToolLLM(responses: Array<{
  content?: string;
  tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
}>) {
  let call = 0;
  const createMock = vi.fn().mockImplementation(async () => {
    const r = responses[call] ?? responses[responses.length - 1];
    call++;
    return { choices: [{ message: r }] };
  });
  return {
    think: vi.fn().mockResolvedValue("fallback"),
    streamThink: vi.fn(),
    client: { chat: { completions: { create: createMock } } },
    model: "gpt-4o",
    createMock,
  } as any;
}

function makeNoClientLLM() {
  return {
    think: vi.fn().mockResolvedValue("no-client-output"),
    streamThink: vi.fn(),
    client: undefined,
    model: undefined,
  } as any;
}

// ===========================================================================
// No-tools path (already covered in skills.test.ts — verify basic)
// ===========================================================================
describe("AgentSkill — no tools", () => {
  it("execute() uses llm.think when no tools", async () => {
    const llm = { think: vi.fn().mockResolvedValue("ok"), streamThink: vi.fn(), client: undefined, model: "m" } as any;
    const skill = new AgentSkill({ name: "s", description: "d" });
    const result = await skill.execute({ query: "q" }, llm);
    expect(result.output).toBe("ok");
    expect(llm.think).toHaveBeenCalledOnce();
  });

  it("execute() falls back to llm.think when client missing", async () => {
    const llm = makeNoClientLLM();
    const skill = new AgentSkill({ name: "s", description: "d", tools: [new EchoTool()] });
    const result = await skill.execute({ query: "q" }, llm);
    expect(result.output).toBe("no-client-output");
    expect(llm.think).toHaveBeenCalledOnce();
  });
});

// ===========================================================================
// Tool-calling loop path
// ===========================================================================
describe("AgentSkill — tool-calling loop", () => {
  it("execute() calls tool and returns final content", async () => {
    const llm = makeToolLLM([
      {
        content: "",
        tool_calls: [{ id: "c1", function: { name: "echo", arguments: JSON.stringify({ text: "hello" }) } }],
      },
      { content: "echoed: hello", tool_calls: [] },
    ]);
    const skill = new AgentSkill({ name: "s", description: "d", tools: [new EchoTool()] });
    const result = await skill.execute({ query: "echo hello" }, llm);
    expect(result.output).toBe("echoed: hello");
    expect(result.toolsUsed).toContain("echo");
  });

  it("execute() records toolsUsed", async () => {
    const llm = makeToolLLM([
      {
        content: "",
        tool_calls: [{ id: "c1", function: { name: "echo", arguments: JSON.stringify({ text: "x" }) } }],
      },
      { content: "done", tool_calls: [] },
    ]);
    const skill = new AgentSkill({ name: "s", description: "d", tools: [new EchoTool()] });
    const result = await skill.execute({ query: "q" }, llm);
    expect(result.toolsUsed).toEqual(["echo"]);
  });

  it("execute() handles tool error gracefully", async () => {
    const badTool = new class extends Tool {
      constructor() { super("bad", "throws"); }
      getParameters(): ToolParameter[] { return []; }
      async run(): Promise<string> { throw new Error("tool failed"); }
    }();
    const llm = makeToolLLM([
      { content: "", tool_calls: [{ id: "c1", function: { name: "bad", arguments: "{}" } }] },
      { content: "recovered", tool_calls: [] },
    ]);
    const skill = new AgentSkill({ name: "s", description: "d", tools: [badTool] });
    const result = await skill.execute({ query: "q" }, llm);
    expect(result.output).toBe("recovered");
  });

  it("execute() handles malformed tool arguments JSON", async () => {
    const llm = makeToolLLM([
      { content: "", tool_calls: [{ id: "c1", function: { name: "echo", arguments: "not-json" } }] },
      { content: "after-bad-args", tool_calls: [] },
    ]);
    const skill = new AgentSkill({ name: "s", description: "d", tools: [new EchoTool()] });
    const result = await skill.execute({ query: "q" }, llm);
    expect(result.output).toBe("after-bad-args");
  });

  it("execute() falls back to extra create when loop exhausts without final content", async () => {
    // All 3 loop iterations return tool_calls, triggering the fallback create
    const llm = makeToolLLM([
      { content: "", tool_calls: [{ id: "c1", function: { name: "echo", arguments: JSON.stringify({ text: "a" }) } }] },
      { content: "", tool_calls: [{ id: "c2", function: { name: "echo", arguments: JSON.stringify({ text: "b" }) } }] },
      { content: "", tool_calls: [{ id: "c3", function: { name: "echo", arguments: JSON.stringify({ text: "c" }) } }] },
      { content: "fallback-final", tool_calls: [] }, // 4th call = fallback
    ]);
    const skill = new AgentSkill({ name: "s", description: "d", tools: [new EchoTool()] });
    const result = await skill.execute({ query: "q" }, llm);
    expect(typeof result.output).toBe("string");
  });

  it("execute() sends tool schemas to completions.create", async () => {
    const llm = makeToolLLM([{ content: "done", tool_calls: [] }]);
    const skill = new AgentSkill({ name: "s", description: "d", tools: [new EchoTool()] });
    await skill.execute({ query: "q" }, llm);
    const callArg = llm.createMock.mock.calls[0][0];
    expect(callArg.tools).toBeDefined();
    expect(callArg.tools.length).toBeGreaterThan(0);
  });

  it("execute() includes history in messages", async () => {
    const llm = makeToolLLM([{ content: "ok", tool_calls: [] }]);
    const skill = new AgentSkill({ name: "s", description: "d", tools: [new EchoTool()] });
    const ctx: SkillContext = {
      query: "follow-up",
      history: [{ role: "user", content: "prev" }, { role: "assistant", content: "prev-reply" }],
    };
    await skill.execute(ctx, llm);
    const msgs = llm.createMock.mock.calls[0][0].messages;
    expect(msgs.some((m: any) => m.content === "prev")).toBe(true);
  });

  it("describe() includes triggerHint when set", () => {
    const skill = new AgentSkill({ name: "s", description: "d", triggerHint: "use when X" });
    expect(skill.describe()).toContain("use when X");
  });

  it("describe() omits triggerHint when not set", () => {
    const skill = new AgentSkill({ name: "s", description: "d" });
    expect(skill.describe()).not.toContain("触发条件");
  });
});
