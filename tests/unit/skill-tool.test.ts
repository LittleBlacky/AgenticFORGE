/**
 * @agenticforge/skills — SkillTool 单元测试
 * 覆盖：SkillTool 构造、getParameters、run、getSkill、skillsToTools
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SkillTool, skillsToTools } from "../../packages/skills/src/SkillTool";
import { AgentSkill } from "../../packages/skills/src/AgentSkill";
import type { IAgentSkill, SkillContext, SkillResult } from "../../packages/skills/src/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockLLM(response = "llm-output") {
  return {
    think: vi.fn().mockResolvedValue(response),
    streamThink: vi.fn(),
    client: undefined,
    model: "mock",
  } as any;
}

function makeSkill(
  name = "test-skill",
  description = "A test skill",
  triggerHint?: string,
  output = "skill-output",
): IAgentSkill {
  return {
    name,
    description,
    triggerHint,
    visible: true,
    execute: vi.fn().mockResolvedValue({ output }),
  };
}

// ===========================================================================
// SkillTool — 构造
// ===========================================================================
describe("SkillTool — 构造", () => {
  it("name 与 skill.name 一致", () => {
    const skill = makeSkill("weather", "天气查询");
    const tool = new SkillTool(skill, makeMockLLM());
    expect(tool.name).toBe("weather");
  });

  it("description 仅包含 skill.description（无 triggerHint 时）", () => {
    const skill = makeSkill("s", "Get stock price");
    const tool = new SkillTool(skill, makeMockLLM());
    expect(tool.description).toBe("Get stock price");
  });

  it("description 包含 triggerHint（有 triggerHint 时）", () => {
    const skill = makeSkill("s", "Get stock price", "当用户询问股票时");
    const tool = new SkillTool(skill, makeMockLLM());
    expect(tool.description).toContain("Get stock price");
    expect(tool.description).toContain("当用户询问股票时");
  });

  it("triggerHint 为空字符串时不拼接", () => {
    const skill = makeSkill("s", "desc", "");
    const tool = new SkillTool(skill, makeMockLLM());
    // 空字符串 falsy，不应拼接
    expect(tool.description).toBe("desc");
  });
});

// ===========================================================================
// SkillTool — getParameters
// ===========================================================================
describe("SkillTool — getParameters", () => {
  it("只有一个 query 参数", () => {
    const tool = new SkillTool(makeSkill(), makeMockLLM());
    const params = tool.getParameters();
    expect(params).toHaveLength(1);
    expect(params[0]!.name).toBe("query");
  });

  it("query 参数为 required", () => {
    const tool = new SkillTool(makeSkill(), makeMockLLM());
    expect(tool.getParameters()[0]!.required).toBe(true);
  });

  it("query 参数类型为 string", () => {
    const tool = new SkillTool(makeSkill(), makeMockLLM());
    expect(tool.getParameters()[0]!.type).toBe("string");
  });
});

// ===========================================================================
// SkillTool — run()
// ===========================================================================
describe("SkillTool — run()", () => {
  it("正向：将 query 传给 skill.execute 并返回 output", async () => {
    const skill = makeSkill("s", "d", undefined, "hello from skill");
    const tool = new SkillTool(skill, makeMockLLM());
    const result = await tool.run({ query: "tell me something" });
    expect(result).toBe("hello from skill");
  });

  it("skill.execute 接收到正确的 query", async () => {
    const skill = makeSkill();
    const tool = new SkillTool(skill, makeMockLLM());
    await tool.run({ query: "what is the weather?" });
    const ctx = (skill.execute as ReturnType<typeof vi.fn>).mock.calls[0][0] as SkillContext;
    expect(ctx.query).toBe("what is the weather?");
  });

  it("query 为空字符串时返回错误提示", async () => {
    const tool = new SkillTool(makeSkill(), makeMockLLM());
    const result = await tool.run({ query: "" });
    expect(result).toContain("错误");
    // skill.execute 不应被调用
    expect(makeSkill().execute as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it("query 缺失时返回错误提示", async () => {
    const tool = new SkillTool(makeSkill(), makeMockLLM());
    const result = await tool.run({});
    expect(result).toContain("错误");
  });

  it("skill.execute 抛出异常时返回 Error 字符串", async () => {
    const skill = makeSkill();
    (skill.execute as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("network timeout"));
    const tool = new SkillTool(skill, makeMockLLM());
    const result = await tool.run({ query: "hello" });
    expect(result).toContain("Error");
    expect(result).toContain("network timeout");
  });

  it("skill.execute 抛出非 Error 对象时也能处理", async () => {
    const skill = makeSkill();
    (skill.execute as ReturnType<typeof vi.fn>).mockRejectedValueOnce("plain string error");
    const tool = new SkillTool(skill, makeMockLLM());
    const result = await tool.run({ query: "hello" });
    expect(result).toContain("Error");
    expect(result).toContain("plain string error");
  });

  it("将 llm 实例传递给 skill.execute", async () => {
    const skill = makeSkill();
    const llm = makeMockLLM();
    const tool = new SkillTool(skill, llm);
    await tool.run({ query: "hi" });
    const passedLlm = (skill.execute as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(passedLlm).toBe(llm);
  });

  it("query 参数 trim 后为空时返回错误", async () => {
    const skill = makeSkill();
    const tool = new SkillTool(skill, makeMockLLM());
    const result = await tool.run({ query: "   " });
    expect(result).toContain("错误");
  });
});

// ===========================================================================
// SkillTool — getSkill()
// ===========================================================================
describe("SkillTool — getSkill()", () => {
  it("返回原始 skill 实例", () => {
    const skill = makeSkill("my-skill", "desc");
    const tool = new SkillTool(skill, makeMockLLM());
    expect(tool.getSkill()).toBe(skill);
  });

  it("getSkill().name 与 tool.name 一致", () => {
    const skill = makeSkill("named-skill", "desc");
    const tool = new SkillTool(skill, makeMockLLM());
    expect(tool.getSkill().name).toBe(tool.name);
  });
});

// ===========================================================================
// skillsToTools() 工厂函数
// ===========================================================================
describe("skillsToTools()", () => {
  it("空数组返回空数组", () => {
    expect(skillsToTools([], makeMockLLM())).toHaveLength(0);
  });

  it("每个 skill 对应一个 SkillTool", () => {
    const skills = [makeSkill("a", "A"), makeSkill("b", "B"), makeSkill("c", "C")];
    const tools = skillsToTools(skills, makeMockLLM());
    expect(tools).toHaveLength(3);
    expect(tools.every((t) => t instanceof SkillTool)).toBe(true);
  });

  it("每个 SkillTool.name 与对应 skill.name 一致", () => {
    const skills = [makeSkill("foo", "Foo"), makeSkill("bar", "Bar")];
    const tools = skillsToTools(skills, makeMockLLM());
    expect(tools[0]!.name).toBe("foo");
    expect(tools[1]!.name).toBe("bar");
  });

  it("所有 SkillTool 共享同一个 llm 实例", async () => {
    const skills = [makeSkill("x", "X"), makeSkill("y", "Y")];
    const llm = makeMockLLM();
    const tools = skillsToTools(skills, llm);
    // 执行每个 tool，验证 llm 被传入
    await tools[0]!.run({ query: "test" });
    await tools[1]!.run({ query: "test" });
    const llm0 = (skills[0]!.execute as ReturnType<typeof vi.fn>).mock.calls[0][1];
    const llm1 = (skills[1]!.execute as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(llm0).toBe(llm);
    expect(llm1).toBe(llm);
  });
});

// ===========================================================================
// SkillTool 与 AgentSkill 集成
// ===========================================================================
describe("SkillTool + AgentSkill 集成", () => {
  it("包装 AgentSkill 后 run() 可正常执行", async () => {
    const llm = makeMockLLM("integrated-output");
    const agentSkill = new AgentSkill({
      name: "integration",
      description: "Integration test skill",
      systemPrompt: "You are a test assistant.",
    });
    const tool = new SkillTool(agentSkill, llm);
    const result = await tool.run({ query: "integration query" });
    expect(result).toBe("integrated-output");
  });

  it("包装 AgentSkill 后 getSkill() 返回原始实例", () => {
    const agentSkill = new AgentSkill({ name: "s", description: "d" });
    const tool = new SkillTool(agentSkill, makeMockLLM());
    expect(tool.getSkill()).toBe(agentSkill);
  });

  it("toOpenAISchema() 包含正确的 name 和 description", () => {
    const skill = makeSkill("stock-query", "查询股票价格", "当用户问股票时");
    const tool = new SkillTool(skill, makeMockLLM());
    const schema = tool.toOpenAISchema();
    expect(schema.function.name).toBe("stock-query");
    expect(schema.function.description).toContain("查询股票价格");
    expect(schema.function.description).toContain("当用户问股票时");
  });

  it("toOpenAISchema() 包含 query 参数", () => {
    const tool = new SkillTool(makeSkill(), makeMockLLM());
    const schema = tool.toOpenAISchema();
    expect(schema.function.parameters.properties).toHaveProperty("query");
    expect(schema.function.parameters.required).toContain("query");
  });
});

// ===========================================================================
// SkillTool — 缓存（cacheSize）
// ===========================================================================
describe("SkillTool — 缓存", () => {
  it("未启用缓存时 getCacheStats() 返回 null", () => {
    const tool = new SkillTool(makeSkill(), makeMockLLM());
    expect(tool.getCacheStats()).toBeNull();
  });

  it("启用缓存后 getCacheStats() 返回 size 和 keys", async () => {
    const tool = new SkillTool(makeSkill(), makeMockLLM(), { cacheSize: 10 });
    await tool.run({ query: "hello" });
    const stats = tool.getCacheStats();
    expect(stats).not.toBeNull();
    expect(stats!.size).toBe(1);
    expect(stats!.keys).toContain("hello");
  });

  it("相同 query 第二次调用命中缓存，skill.execute 只调用一次", async () => {
    const skill = makeSkill();
    const tool = new SkillTool(skill, makeMockLLM(), { cacheSize: 10 });
    await tool.run({ query: "cached query" });
    await tool.run({ query: "cached query" });
    expect(skill.execute as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
  });

  it("不同 query 各自独立缓存", async () => {
    const skill = makeSkill();
    const tool = new SkillTool(skill, makeMockLLM(), { cacheSize: 10 });
    await tool.run({ query: "query-a" });
    await tool.run({ query: "query-b" });
    expect(skill.execute as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(2);
    expect(tool.getCacheStats()!.size).toBe(2);
  });

  it("clearCache() 后再次请求重新调用 skill.execute", async () => {
    const skill = makeSkill();
    const tool = new SkillTool(skill, makeMockLLM(), { cacheSize: 10 });
    await tool.run({ query: "q" });
    tool.clearCache();
    expect(tool.getCacheStats()!.size).toBe(0);
    await tool.run({ query: "q" });
    expect(skill.execute as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(2);
  });

  it("cacheSize 为 0 时不启用缓存", () => {
    const tool = new SkillTool(makeSkill(), makeMockLLM(), { cacheSize: 0 });
    expect(tool.getCacheStats()).toBeNull();
  });

  it("未启用缓存时 clearCache() 不抛出", () => {
    const tool = new SkillTool(makeSkill(), makeMockLLM());
    expect(() => tool.clearCache()).not.toThrow();
  });
});

// ===========================================================================
// SkillTool — 渐进式披露（formatOutput / runSkill）
// ===========================================================================
describe("SkillTool — 渐进式披露", () => {
  it("skill 无 toolsUsed 时 run() 直接返回 output", async () => {
    const skill = makeSkill("s", "d", undefined, "plain output");
    const tool = new SkillTool(skill, makeMockLLM());
    const result = await tool.run({ query: "q" });
    expect(result).toBe("plain output");
    expect(result).not.toContain("tools_used");
  });

  it("skill 有 toolsUsed 时 run() 附加 [tools_used: ...] 行", async () => {
    const skill = makeSkill();
    (skill.execute as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      output: "tool output",
      toolsUsed: ["search", "calculator"],
    });
    const tool = new SkillTool(skill, makeMockLLM());
    const result = await tool.run({ query: "q" });
    expect(result).toContain("tool output");
    expect(result).toContain("[tools_used: search, calculator]");
  });

  it("toolsUsed 为空数组时不附加元数据行", async () => {
    const skill = makeSkill();
    (skill.execute as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      output: "output",
      toolsUsed: [],
    });
    const tool = new SkillTool(skill, makeMockLLM());
    const result = await tool.run({ query: "q" });
    expect(result).toBe("output");
    expect(result).not.toContain("tools_used");
  });

  it("runSkill() 返回完整 SkillResult（含 toolsUsed 和 data）", async () => {
    const skill = makeSkill();
    (skill.execute as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      output: "raw output",
      toolsUsed: ["search"],
      data: { confidence: 0.9 },
    });
    const tool = new SkillTool(skill, makeMockLLM());
    const result = await tool.runSkill("detailed query");
    expect(result.output).toBe("raw output");
    expect(result.toolsUsed).toEqual(["search"]);
    expect(result.data).toEqual({ confidence: 0.9 });
  });

  it("runSkill() query 为空时抛出错误", async () => {
    const tool = new SkillTool(makeSkill(), makeMockLLM());
    await expect(tool.runSkill("")).rejects.toThrow("query 不能为空");
  });

  it("runSkill() 不经过缓存，每次都调用 skill.execute", async () => {
    const skill = makeSkill();
    const tool = new SkillTool(skill, makeMockLLM(), { cacheSize: 10 });
    await tool.runSkill("q");
    await tool.runSkill("q");
    expect(skill.execute as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(2);
  });

  it("skillsToTools() 传入 cacheSize 后所有 tool 均启用缓存", () => {
    const skills = [makeSkill("a", "A"), makeSkill("b", "B")];
    const tools = skillsToTools(skills, makeMockLLM(), { cacheSize: 20 });
    expect(tools.every((t) => t.getCacheStats() !== null)).toBe(true);
  });
});
