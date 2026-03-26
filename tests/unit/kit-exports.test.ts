import { describe, it, expect } from "vitest";
import * as Kit from "../../packages/kit/src/index";

describe("@agenticforge/kit exports", () => {
  it("should export core and context runtime APIs", () => {
    expect(Kit.Message).toBeTypeOf("function");
    expect(Kit.ContextBuilder).toBeTypeOf("function");
    expect(Kit.fromMemoryEmbedder).toBeTypeOf("function");
    expect(Kit.estimateTokens).toBeTypeOf("function");
  });

  it("should export tools runtime APIs without wildcard conflicts", () => {
    expect(Kit.Tool).toBeTypeOf("function");
    expect(Kit.ToolRegistry).toBeTypeOf("function");
    expect(Kit.AsyncToolExecutor).toBeTypeOf("function");
  });
});
