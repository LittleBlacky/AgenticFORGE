/**
 * @agenticforge/tools 鈥?鍗曞厓娴嬭瘯
 * 瑕嗙洊锛歍ool, ToolRegistry, ToolChain, ToolChainManager, AsyncToolExecutor
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Tool } from "../../packages/tools/src/Tool";
import { ToolRegistry } from "../../packages/tools/src/ToolRegistry";
import { ToolChain, ToolChainManager } from "../../packages/tools/src/ToolChain";
import { AsyncToolExecutor } from "../../packages/tools/src/AsyncToolExecutor";
import type { ToolParameter } from "../../packages/tools/src/types";
import { z } from "zod";

class EchoTool extends Tool {
  constructor() { super("echo", "Echoes input"); }
  getParameters(): ToolParameter[] {
    return [{ name: "input", type: "string", description: "text", required: true, default: null }];
  }
  async run(p: Record<string, unknown>) { return String(p.input ?? ""); }
}

class UpperTool extends Tool {
  constructor() { super("upper", "Uppercases"); }
  getParameters(): ToolParameter[] {
    return [{ name: "input", type: "string", description: "text", required: true, default: null }];
  }
  async run(p: Record<string, unknown>) { return String(p.input ?? "").toUpperCase(); }
}

class FailTool extends Tool {
  constructor() { super("fail", "Always fails"); }
  getParameters(): ToolParameter[] { return []; }
  async run(_: Record<string, unknown>): Promise<string> { throw new Error("deliberate failure"); }
}

class TypedTool extends Tool {
  constructor() { super("typed", "Typed params"); }
  getParameters(): ToolParameter[] {
    return [
      { name: "name", type: "string", description: "str", required: true, default: null },
      { name: "count", type: "number", description: "num", required: false, default: 1 },
      { name: "flag", type: "boolean", description: "bool", required: false, default: false },
    ];
  }
  async run(p: Record<string, unknown>) { return JSON.stringify(p); }
}

// ===========================================================================
// Tool
// ===========================================================================
describe("Tool", () => {
  let echo: EchoTool;
  beforeEach(() => { echo = new EchoTool(); });

  it("has correct name and description", () => {
    expect(echo.name).toBe("echo");
    expect(echo.description).toBe("Echoes input");
  });

  it("run() returns string output", async () => {
    expect(await echo.run({ input: "hello" })).toBe("hello");
  });

  it("validateParameters() true when required params present", () => {
    expect(echo.validateParameters({ input: "x" })).toBe(true);
  });

  it("validateParameters() false when required param missing", () => {
    expect(echo.validateParameters({})).toBe(false);
  });

  it("validateParameters() false when required param is null", () => {
    expect(echo.validateParameters({ input: null })).toBe(false);
  });

  it("validateAndNormalizeParameters() success with required params", () => {
    const r = echo.validateAndNormalizeParameters({ input: "hi" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.input).toBe("hi");
  });

  it("validateAndNormalizeParameters() fails when required param missing", () => {
    const r = echo.validateAndNormalizeParameters({});
    expect(r.success).toBe(false);
  });

  it("validateAndNormalizeParameters() uses defaults for optional params", () => {
    const typed = new TypedTool();
    const r = typed.validateAndNormalizeParameters({ name: "bob" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.count).toBe(1);
      expect(r.data.flag).toBe(false);
    }
  });

  it("toOpenAISchema() returns valid function schema", () => {
    const schema = echo.toOpenAISchema();
    expect(schema.type).toBe("function");
    expect(schema.function.name).toBe("echo");
    expect((schema.function.parameters as any).type).toBe("object");
    const props = (schema.function.parameters as any).properties as Record<string, unknown>;
    expect(props.input).toBeDefined();
  });

  it("toOpenAISchema() marks required fields", () => {
    expect((echo.toOpenAISchema().function.parameters as any).required).toContain("input");
  });

  it("toOpenAISchema() omits required when no required params", () => {
    const schema = new FailTool().toOpenAISchema();
    expect((schema.function.parameters as any).required).toBeUndefined();
  });

  it("describe() returns readable string", () => {
    const desc = echo.describe();
    expect(desc).toContain("echo");
    expect(desc).toContain("input");
  });

  it("expandable defaults to false", () => {
    expect(echo.expandable).toBe(false);
  });
});

// ===========================================================================
// ToolRegistry
// ===========================================================================
describe("ToolRegistry", () => {
  let registry: ToolRegistry;
  beforeEach(() => { registry = new ToolRegistry(); });

  it("registerTool / getTool roundtrip", () => {
    const echo = new EchoTool();
    registry.registerTool(echo);
    expect(registry.getTool("echo")).toBe(echo);
  });

  it("unregisterTool removes and returns true", () => {
    registry.registerTool(new EchoTool());
    expect(registry.unregisterTool("echo")).toBe(true);
    expect(registry.getTool("echo")).toBeUndefined();
  });

  it("unregisterTool returns false for unknown", () => {
    expect(registry.unregisterTool("nope")).toBe(false);
  });

  it("hasTool() true for registered Tool", () => {
    registry.registerTool(new EchoTool());
    expect(registry.hasTool("echo")).toBe(true);
  });

  it("hasTool() false for unregistered", () => {
    expect(registry.hasTool("nope")).toBe(false);
  });

  it("hasTool() true for registered function", () => {
    registry.registerFunction("fn", "d", async () => "ok");
    expect(registry.hasTool("fn")).toBe(true);
  });

  it("registerFunction / execute", async () => {
    registry.registerFunction("shout", "Shouts", async ({ input }: any) => String(input).toUpperCase());
    expect(await registry.execute("shout", { input: "hi" })).toBe("HI");
  });

  it("unregisterFunction removes function", () => {
    registry.registerFunction("fn", "d", async () => "ok");
    expect(registry.unregisterFunction("fn")).toBe(true);
    expect(registry.hasTool("fn")).toBe(false);
  });

  it("execute() calls tool.run()", async () => {
    registry.registerTool(new EchoTool());
    expect(await registry.execute("echo", { input: "world" })).toBe("world");
  });

  it("execute() throws for unknown tool", async () => {
    await expect(registry.execute("unknown", {})).rejects.toThrow("Tool not found");
  });

  it("getAllTools() returns all registered Tools", () => {
    registry.registerTool(new EchoTool());
    registry.registerTool(new UpperTool());
    expect(registry.getAllTools()).toHaveLength(2);
  });

  it("listTools() includes Tool and function names", () => {
    registry.registerTool(new EchoTool());
    registry.registerFunction("fn", "d", async () => "ok");
    const list = registry.listTools();
    expect(list).toContain("echo");
    expect(list).toContain("fn");
  });

  it("getAvailableTools() describes tools when registered", () => {
    registry.registerTool(new EchoTool());
    expect(registry.getAvailableTools()).toContain("echo");
  });

  it("getAvailableTools() returns a non-empty string when empty (placeholder)", () => {
    const result = registry.getAvailableTools();
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
    // Sanity-check: no real tool descriptions should appear
    expect(result).not.toContain("echo");
  });

  it("getOpenAISchemas() returns schema for each tool", () => {
    registry.registerTool(new EchoTool());
    registry.registerTool(new UpperTool());
    expect(registry.getOpenAISchemas()).toHaveLength(2);
  });

  it("getFunction() returns undefined for unknown", () => {
    expect(registry.getFunction("nope")).toBeUndefined();
  });

  it("getFunction() returns registered function", () => {
    registry.registerFunction("fn", "d", async () => "ok");
    expect(registry.getFunction("fn")).toBeDefined();
  });
});

// ===========================================================================
// ToolChain
// ===========================================================================
describe("ToolChain", () => {
  let registry: ToolRegistry;
  beforeEach(() => {
    registry = new ToolRegistry();
    registry.registerTool(new EchoTool());
    registry.registerTool(new UpperTool());
  });

  it("addStep / getSteps basic", () => {
    const chain = new ToolChain("c1", "desc");
    chain.addStep("echo", "{input}", "step1");
    expect(chain.getSteps()).toHaveLength(1);
  });

  it("addStep supports fluent chaining", () => {
    const chain = new ToolChain("c", "d");
    expect(chain.addStep("echo", "{input}", "out")).toBe(chain);
  });

  it("execute() single step passes input correctly", async () => {
    const chain = new ToolChain("c", "d");
    chain.addStep("echo", "{input}", "result");
    expect(await chain.execute(registry, "hello")).toBe("hello");
  });

  it("execute() two-step: echo then upper", async () => {
    const chain = new ToolChain("c", "d");
    chain.addStep("echo", "{input}", "echoed");
    chain.addStep("upper", "{echoed}", "final");
    expect(await chain.execute(registry, "hello")).toBe("HELLO");
  });

  it("execute() with no steps returns input", async () => {
    const chain = new ToolChain("empty", "no steps");
    expect(await chain.execute(registry, "raw")).toBe("raw");
  });

  it("execute() interpolates context variables", async () => {
    const chain = new ToolChain("c", "d");
    chain.addStep("echo", "prefix-{input}", "out");
    expect(await chain.execute(registry, "world")).toBe("prefix-world");
  });

  it("getSteps() returns a copy", () => {
    const chain = new ToolChain("c", "d");
    chain.addStep("echo", "{input}", "out");
    const steps = chain.getSteps();
    steps.pop();
    expect(chain.getSteps()).toHaveLength(1);
  });
});

// ===========================================================================
// ToolChainManager
// ===========================================================================
describe("ToolChainManager", () => {
  let registry: ToolRegistry;
  let manager: ToolChainManager;
  beforeEach(() => {
    registry = new ToolRegistry();
    registry.registerTool(new EchoTool());
    manager = new ToolChainManager(registry);
  });

  it("registerChain / getChain roundtrip", () => {
    const chain = new ToolChain("c", "d");
    manager.registerChain(chain);
    expect(manager.getChain("c")).toBe(chain);
  });

  it("listChains() returns registered names", () => {
    manager.registerChain(new ToolChain("a", "A"));
    manager.registerChain(new ToolChain("b", "B"));
    expect(manager.listChains()).toEqual(expect.arrayContaining(["a", "b"]));
  });

  it("executeChain() runs the chain", async () => {
    const chain = new ToolChain("ec", "d");
    chain.addStep("echo", "{input}", "out");
    manager.registerChain(chain);
    expect(await manager.executeChain("ec", "test")).toBe("test");
  });

  it("executeChain() throws for unknown chain", async () => {
    await expect(manager.executeChain("nope", "x")).rejects.toThrow("ToolChain not found");
  });

  it("getChain() returns undefined for unknown", () => {
    expect(manager.getChain("nope")).toBeUndefined();
  });
});

// ===========================================================================
// AsyncToolExecutor
// ===========================================================================
describe("AsyncToolExecutor", () => {
  let registry: ToolRegistry;
  let executor: AsyncToolExecutor;
  beforeEach(() => {
    registry = new ToolRegistry();
    registry.registerTool(new EchoTool());
    registry.registerTool(new UpperTool());
    registry.registerTool(new FailTool());
    executor = new AsyncToolExecutor(registry, 4);
  });

  it("executeSingle() returns result on success", async () => {
    const r = await executor.executeSingle({ id: "1", toolName: "echo", parameters: { input: "hi" } });
    expect(r.id).toBe("1");
    expect(r.output).toBe("hi");
    expect(r.error).toBeUndefined();
    expect(r.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("executeSingle() captures error", async () => {
    const r = await executor.executeSingle({ id: "2", toolName: "fail", parameters: {} });
    expect(r.output).toBe("");
    expect(r.error).toContain("deliberate failure");
  });

  it("executeBatch() processes all requests", async () => {
    const results = await executor.executeBatch([
      { id: "a", toolName: "echo", parameters: { input: "hello" } },
      { id: "b", toolName: "upper", parameters: { input: "world" } },
    ]);
    expect(results).toHaveLength(2);
    expect(results.find(r => r.id === "a")?.output).toBe("hello");
    expect(results.find(r => r.id === "b")?.output).toBe("WORLD");
  });

  it("executeBatch() handles mixed success and failure", async () => {
    const results = await executor.executeBatch([
      { id: "ok", toolName: "echo", parameters: { input: "fine" } },
      { id: "bad", toolName: "fail", parameters: {} },
    ]);
    expect(results.find(r => r.id === "ok")?.output).toBe("fine");
    expect(results.find(r => r.id === "bad")?.error).toBeDefined();
  });

  it("executeBatch() with empty array returns empty", async () => {
    expect(await executor.executeBatch([])).toHaveLength(0);
  });

  it("executeBatch() handles 10 parallel requests", async () => {
    const requests = Array.from({ length: 10 }, (_, i) => ({
      id: String(i), toolName: "echo", parameters: { input: String(i) },
    }));
    const results = await executor.executeBatch(requests);
    expect(results).toHaveLength(10);
    expect(results.every(r => r.error === undefined)).toBe(true);
  });

  it("constructor clamps concurrency to minimum 1", async () => {
    const e = new AsyncToolExecutor(registry, 0);
    const r = await e.executeBatch([{ id: "x", toolName: "echo", parameters: { input: "x" } }]);
    expect(r[0]?.output).toBe("x");
  });
});

