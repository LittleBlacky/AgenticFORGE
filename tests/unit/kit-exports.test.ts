import { describe, it, expect } from "vitest";
import * as Kit from "../../packages/kit/src/index";

describe("@agenticforge/kit exports", () => {
  it("should export core runtime helpers", () => {
    // Message is now an interface (type-only), no runtime value — use createAgentMessage instead
    expect(Kit.createAgentMessage).toBeTypeOf("function");
    expect(Kit.toLLMMessage).toBeTypeOf("function");
    expect(Kit.formatMessage).toBeTypeOf("function");
  });

  it("should export context runtime APIs", () => {
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
