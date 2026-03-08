import {Tool, type FunctionTool} from "./Tool";

/**
 * 工具注册表
 */
export class ToolRegistry {
  private readonly tools: Map<string, Tool> = new Map();
  private readonly functions: Map<string, FunctionTool<any>> = new Map();

  /**
   * 注册 Tool 对象
   * - 默认会自动展开 expandable 工具的 @toolAction 子工具
   * @param tool 工具实例
   */
  registerTool(tool: Tool): void {
    this.setTool(tool);

    const expanded = tool.getExpandedTools();
    if (!expanded || expanded.length === 0) {
      return;
    }

    for (const subTool of expanded) {
      this.setTool(subTool);
    }
  }

  /**
   * 直接注册函数作为工具（简便方式）
   * 统一采用原生参数调用。
   */
  registerFunction<TArgs extends Record<string, any> = Record<string, any>>(
    name: string,
    description: string,
    func: (args: TArgs) => string | Promise<string>,
    schema?: FunctionTool<TArgs>["schema"],
  ): void {
    if (this.functions.has(name) || this.tools.has(name)) {
      console.warn(`⚠️ 警告: 工具 '${name}' 已存在，将被覆盖。`);
    }
    this.functions.set(name, {
      name,
      description,
      schema: schema,
      func: func,
    });
    console.log(`✅ 函数工具 '${name}' 已注册。`);
  }

  /**
   * 获取 Tool 工具
   */
  getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /**
   * 获取函数工具
   */
  getFunction(name: string): FunctionTool | undefined {
    return this.functions.get(name);
  }

  /**
   * 执行工具（优先执行 Tool，其次函数工具）
   */
  async execute(
    name: string,
    parameters: Record<string, unknown> = {},
  ): Promise<string> {
    const tool = this.tools.get(name);
    if (tool) {
      const validation = tool.validateAndNormalizeParameters(parameters);
      if (!validation.success) {
        throw new Error(`工具 '${name}' 参数校验失败: ${validation.error}`);
      }
      const result = await tool.run(validation.data);
      return String(result);
    }

    const fnTool = this.functions.get(name);
    if (fnTool) {
      const validatedParameters = this.validateFunctionParameters(
        name,
        parameters,
        fnTool,
      );

      const result = await fnTool.func(validatedParameters);
      return String(result);
    }

    throw new Error(`工具 '${name}' 未注册`);
  }

  /**
   * 获取可用工具说明
   */
  getAvailableTools(): string {
    const toolLines = Array.from(this.tools.values()).map(
      (tool) => `- ${tool.name}: ${tool.description}`,
    );
    const fnLines = Array.from(this.functions.entries()).map(
      ([name, tool]) => `- ${name}: ${tool.description}`,
    );
    return [...toolLines, ...fnLines].join("\n");
  }

  /**
   * 移除工具（Tool 或函数工具）
   */
  unregisterTool(name: string): boolean {
    const removedTool = this.tools.delete(name);
    const removedFunction = this.functions.delete(name);
    return removedTool || removedFunction;
  }

  /**
   * 列出所有工具名称
   */
  listTools(): string[] {
    return [...this.tools.keys(), ...this.functions.keys()];
  }

  /**
   * 获取所有 Tool 实例
   */
  getAllTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  private setTool(tool: Tool): void {
    if (this.tools.has(tool.name) || this.functions.has(tool.name)) {
      console.warn(`⚠️ 警告: 工具 '${tool.name}' 已存在，将被覆盖。`);
    }
    this.tools.set(tool.name, tool);
    console.log(`✅ 工具 '${tool.name}' 已注册。`);
  }

  private validateFunctionParameters(
    toolName: string,
    parameters: Record<string, unknown>,
    fnTool: FunctionTool,
  ): Record<string, unknown> {
    if (!fnTool.schema) {
      return parameters;
    }

    try {
      const parsed = fnTool.schema.parse(parameters) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      throw new Error("schema 解析结果必须是对象");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`工具 '${toolName}' 参数校验失败: ${message}`);
    }
  }
}

