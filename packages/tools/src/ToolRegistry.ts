import { z } from "zod";
import type { Tool } from "./Tool";
import { type FunctionTool, type OpenAIFunctionSchema } from "./Tool";

/**
 * Central registry that manages Tool instances and raw FunctionTools.
 * Supports registration, lookup, and execution.
 */
export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();
  private readonly functions = new Map<string, FunctionTool<Record<string, unknown>>>();

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  registerTool(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  unregisterTool(name: string): boolean {
    return this.tools.delete(name);
  }

  registerFunction<TArgs extends Record<string, unknown>>(
    name: string,
    description: string,
    func: (args: TArgs) => string | Promise<string>,
    schema?: FunctionTool<TArgs>["schema"],
  ): void {
    this.functions.set(name, {
      name,
      description,
      func: func as FunctionTool<Record<string, unknown>>["func"],
      schema: schema as FunctionTool<Record<string, unknown>>["schema"],
    });
  }

  unregisterFunction(name: string): boolean {
    return this.functions.delete(name);
  }

  // ---------------------------------------------------------------------------
  // Lookup
  // ---------------------------------------------------------------------------

  getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  getFunction(name: string): FunctionTool<Record<string, unknown>> | undefined {
    return this.functions.get(name);
  }

  getAllTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  listTools(): string[] {
    return [...Array.from(this.tools.keys()), ...Array.from(this.functions.keys())];
  }

  hasTool(name: string): boolean {
    return this.tools.has(name) || this.functions.has(name);
  }

  // ---------------------------------------------------------------------------
  // Execution
  // ---------------------------------------------------------------------------

  async execute(name: string, parameters: Record<string, unknown>): Promise<string> {
    const tool = this.tools.get(name);
    if (tool) {
      const validation = tool.validateAndNormalizeParameters(parameters);
      if (!validation.success) {
        return `Error: ${validation.error}`;
      }
      return await tool.run(validation.data);
    }

    const fn = this.functions.get(name);
    if (fn) {
      if (fn.schema) {
        const result = fn.schema.safeParse(parameters);
        if (!result.success) {
          return `Error: ${result.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ")}`;
        }
        return await fn.func(result.data as Record<string, unknown>);
      }
      return await fn.func(parameters);
    }

    throw new Error(`Tool not found: ${name}`);
  }

  // ---------------------------------------------------------------------------
  // Description (for system prompts)
  // ---------------------------------------------------------------------------

  getAvailableTools(): string {
    const lines: string[] = [];

    for (const tool of this.tools.values()) {
      lines.push(tool.describe());
    }

    for (const fn of this.functions.values()) {
      lines.push(`Tool: ${fn.name}\nDescription: ${fn.description}`);
    }

    if (lines.length === 0) return "暂无可用工具";
    return lines.join("\n\n");
  }

  getOpenAISchemas(): Array<OpenAIFunctionSchema | Record<string, unknown>> {
    const schemas: Array<OpenAIFunctionSchema | Record<string, unknown>> = [];

    for (const tool of this.tools.values()) {
      schemas.push(tool.toOpenAISchema());
    }

    for (const fn of this.functions.values()) {
      let parameters: Record<string, unknown> = {
        type: "object",
        properties: { input: { type: "string", description: "输入文本" } },
        required: ["input"],
      };
      if (fn.schema) {
        try {
          parameters = z.toJSONSchema(fn.schema, { target: "draft-7" }) as Record<string, unknown>;
        } catch {
          // 降级使用默认 schema
        }
      }
      schemas.push({
        type: "function",
        function: { name: fn.name, description: fn.description, parameters },
      });
    }

    return schemas;
  }
}
