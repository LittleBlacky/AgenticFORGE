/**
 * Integration tests — cross-package collaboration scenarios
 * 场景：Tool → ToolRegistry → WorkflowEngine (tool node)
 *       MemoryManager + ContextBuilder
 *       SkillRunner + AgentSkill + ToolRegistry
 */
import { describe, it, expect, vi } from "vitest";
import { Tool, ToolRegistry, ToolChain } from "@agenticforge/tools";
import { WorkflowEngine } from "../../packages/agents/src/workflow-agent/WorkflowEngine";
import { MemoryManager } from "../../packages/memory/src/manager";
import { ContextBuilder } from "../../packages/context/src/ContextBuilder";
import { AgentSkill } from "@agenticforge/skills";
import { SkillRunner } from "@agenticforge/skills";
import type { ToolParameter } from "../../packages/tools/src/types";
import type { WorkflowDefinition } from "../../packages/agents/src/workflow-agent/types";

class UpperTool extends Tool {
  constructor() { super("upper", "Uppercase tool"); }
  getParameters(): ToolParameter[] {
    return [{ name: "input", type: "string", description: "text", required: true, default: null }];
  }
  async run(p: Record<string, unknown>) { return String(p.input ?? "").toUpperCase(); }
}

class EchoTool extends Tool {
  constructor() { super("echo", "Echo tool"); }
  getParameters(): ToolParameter[] {
    return [{ name: "input", type: "string", description: "text", required: true, default: null }];
  }
  async run(p: Record<string, unknown>) { return String(p.input ?? ""); }
}

function makeMockLLM(response = "llm") {
  return {
    think: vi.fn().mockResolvedValue(response),
    client: undefined, model: "mock",
  } as any;
}

// ===========================================================================
// Tool → ToolRegistry → WorkflowEngine tool node
// ===========================================================================
describe("Integration: WorkflowEngine with ToolRegistry", () => {
  it("tool node executes registered tool via registry", async () => {
    const registry = new ToolRegistry();
    registry.registerTool(new UpperTool());
    const engine = new WorkflowEngine({ llm: makeMockLLM(), registry });
    const def: WorkflowDefinition = {
      name: "tool-test",
      nodes: [{ id: "t", type: "tool", toolName: "upper", inputTemplate: "{input}", depends: [] }],
    };
    const r = await engine.execute(def, "hello");
    expect(r.output).toBe("HELLO");
  });

  it("tool node output flows into next llm node", async () => {
    const registry = new ToolRegistry();
    registry.registerTool(new EchoTool());
    const llm = makeMockLLM("processed");
    const engine = new WorkflowEngine({ llm, registry });
    const def: WorkflowDefinition = {
      name: "tool-llm",
      nodes: [
        { id: "fetch", type: "tool", toolName: "echo", inputTemplate: "{input}", depends: [] },
        { id: "analyze", type: "llm", promptTemplate: "Analyze: {fetch}", depends: ["fetch"] },
      ],
    };
    const r = await engine.execute(def, "raw data");
    expect(r.output).toBe("processed");
    const analyzeMsg = llm.think.mock.calls[0][0] as Array<{ role: string; content: string }>;
    expect(analyzeMsg.some(m => m.content.includes("raw data"))).toBe(true);
  });

  it("parallel tool nodes both execute", async () => {
    const registry = new ToolRegistry();
    registry.registerTool(new UpperTool());
    registry.registerTool(new EchoTool());
    const engine = new WorkflowEngine({ llm: makeMockLLM("merged"), registry });
    const def: WorkflowDefinition = {
      name: "par-tools",
      nodes: [
        { id: "u", type: "tool", toolName: "upper", inputTemplate: "{input}", depends: [] },
        { id: "e", type: "tool", toolName: "echo", inputTemplate: "{input}", depends: [] },
        { id: "m", type: "llm", promptTemplate: "{u} and {e}", depends: ["u", "e"] },
      ],
    };
    const r = await engine.execute(def, "test");
    expect(r.context["u"]).toBe("TEST");
    expect(r.context["e"]).toBe("test");
  });
});

// ===========================================================================
// ToolChain → WorkflowEngine fn node
// ===========================================================================
describe("Integration: ToolChain inside WorkflowEngine fn node", () => {
  it("fn node can execute a ToolChain", async () => {
    const registry = new ToolRegistry();
    registry.registerTool(new UpperTool());
    const chain = new ToolChain("uc", "upper chain");
    chain.addStep("upper", "{input}", "result");

    const engine = new WorkflowEngine({ llm: makeMockLLM(), registry });
    const def: WorkflowDefinition = {
      name: "chain-in-fn",
      nodes: [{
        id: "run-chain",
        type: "fn",
        depends: [],
        executor: async (ctx) => chain.execute(registry, ctx["input"] ?? ""),
      }],
    };
    const r = await engine.execute(def, "hello world");
    expect(r.output).toBe("HELLO WORLD");
  });
});

// ===========================================================================
// MemoryManager + ContextBuilder
// ===========================================================================
describe("Integration: MemoryManager + ContextBuilder", () => {
  it("retrieved memories can be used as context packets", async () => {
    const manager = new MemoryManager({ enableWorking: true, enableEpisodic: false, enableSemantic: false });
    await manager.addMemory({ content: "User prefers TypeScript", importance: 0.9, memoryType: "working" });
    await manager.addMemory({ content: "User is a senior developer", importance: 0.8, memoryType: "working" });

    const memories = await manager.retrieveMemories({ query: "TypeScript", limit: 5 });
    const packets = memories.map(m => ({
      content: m.content,
      metadata: { type: "related_memory" },
      relevanceScore: m.importance,
    }));

    const builder = new ContextBuilder({ config: { maxTokens: 4096 } });
    const ctx = await builder.build({
      userQuery: "What language should I use?",
      additionalPackets: packets,
    });

    expect(ctx.includedPackets.length).toBeGreaterThan(0);
    expect(ctx.includedPackets.some(p => p.content.includes("TypeScript"))).toBe(true);
  });
});

// ===========================================================================
// SkillRunner + AgentSkill (no tools, fallback LLM)
// ===========================================================================
describe("Integration: SkillRunner routing", () => {
  it("runner routes to single skill and returns output", async () => {
    const llm = makeMockLLM("skill-answer");
    const skill = new AgentSkill({
      name: "faq",
      description: "Answers FAQ questions",
      systemPrompt: "You answer FAQs.",
    });
    const runner = new SkillRunner({ llm, skills: [skill] });
    const result = await runner.run("What is AgenticFORGE?");
    expect(result.output).toBe("skill-answer");
  });

  it("runner invokes named skill directly", async () => {
    const llm = makeMockLLM("direct-answer");
    const skill = new AgentSkill({ name: "direct", description: "Direct skill" });
    const runner = new SkillRunner({ llm, skills: [skill] });
    const result = await runner.runSkill("direct", "question");
    expect(result.output).toBe("direct-answer");
  });

  it("runner falls back to LLM when skill list is empty", async () => {
    const llm = makeMockLLM("fallback-answer");
    const runner = new SkillRunner({ llm, skills: [] });
    const result = await runner.run("anything");
    expect(result.output).toBe("fallback-answer");
  });
});
