import { Agent, Message, ToolCallExecutor, createAgentMessage } from "@agenticforge/core";
import type { ChatMessage } from "@agenticforge/core";
import { Tool, type FunctionTool, type OpenAIFunctionSchema } from "@agenticforge/tools";
import { ToolRegistry } from "@agenticforge/tools";
import { z } from "zod";

type ToolChoice = "auto" | "none" | { type: "function"; function: { name: string } };

function mapParameterType(paramType: string): string {
  const normalized = (paramType || "").toLowerCase();
  if (["string", "number", "integer", "boolean", "array", "object"].includes(normalized))
    return normalized;
  return "string";
}

export class FunctionCallAgent extends Agent {
  private readonly toolRegistry?: ToolRegistry;
  private readonly enableToolCalling: boolean;
  private readonly defaultToolChoice: ToolChoice;
  private readonly maxToolIterations: number;

  constructor(params: {
    name: string;
    llm: Agent["llm"];
    systemPrompt?: string;
    config?: Agent["config"];
    toolRegistry?: ToolRegistry;
    tools?: Array<Tool | FunctionTool<any>>;
    enableToolCalling?: boolean;
    defaultToolChoice?: ToolChoice;
    maxToolIterations?: number;
  }) {
    super({
      name: params.name,
      llm: params.llm,
      systemPrompt: params.systemPrompt,
      config: params.config,
    });

    if (params.toolRegistry) {
      this.toolRegistry = params.toolRegistry;
    } else if ((params.tools ?? []).length > 0) {
      const registry = new ToolRegistry();
      for (const tool of params.tools ?? []) {
        if (tool instanceof Tool) {
          registry.registerTool(tool);
        } else {
          registry.registerFunction(tool.name, tool.description, tool.func, tool.schema);
        }
      }
      this.toolRegistry = registry;
    }

    this.enableToolCalling = (params.enableToolCalling ?? true) && this.toolRegistry !== undefined;
    this.defaultToolChoice = params.defaultToolChoice ?? "auto";
    this.maxToolIterations = params.maxToolIterations ?? 10;
  }

  // ---------------------------------------------------------------------------
  // Tool schema building
  // ---------------------------------------------------------------------------

  private buildToolSchemas(): Record<string, unknown>[] {
    if (!this.enableToolCalling || !this.toolRegistry) return [];
    const schemas: Record<string, unknown>[] = [];

    for (const tool of this.toolRegistry.getAllTools()) {
      schemas.push(tool.toOpenAISchema() as unknown as Record<string, unknown>);
    }

    const fnMap = (this.toolRegistry as any).functions as
      | Map<string, FunctionTool<any>>
      | undefined;
    for (const [name, fnTool] of fnMap?.entries() ?? []) {
      let parameters: Record<string, unknown> = {
        type: "object",
        properties: { input: { type: "string", description: "输入文本" } },
        required: ["input"],
      };
      if (fnTool.schema) {
        try {
          parameters = z.toJSONSchema(fnTool.schema, { target: "draft-7" }) as Record<
            string,
            unknown
          >;
        } catch {}
      }
      schemas.push({
        type: "function",
        function: { name, description: fnTool.description ?? "", parameters },
      });
    }
    return schemas;
  }

  // ---------------------------------------------------------------------------
  // Parameter type coercion (for strict-typed Tool subclasses)
  // ---------------------------------------------------------------------------

  private convertParameterTypes(
    toolName: string,
    parameters: Record<string, unknown>,
  ): Record<string, unknown> {
    if (!this.toolRegistry) return parameters;
    const tool = this.toolRegistry.getTool(toolName);
    if (!tool) return parameters;
    let toolParams: ReturnType<Tool["getParameters"]>;
    try {
      toolParams = tool.getParameters();
    } catch {
      return parameters;
    }
    const typeMap = new Map(toolParams.map((p) => [p.name, p.type]));
    const converted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parameters)) {
      const rawType = typeMap.get(key);
      if (!rawType) {
        converted[key] = value;
        continue;
      }
      const type = mapParameterType(rawType);
      try {
        if (type === "number")
          converted[key] = typeof value === "string" ? Number.parseFloat(value) : value;
        else if (type === "integer")
          converted[key] = typeof value === "string" ? Number.parseInt(value, 10) : value;
        else if (type === "boolean") {
          if (typeof value === "boolean") converted[key] = value;
          else if (typeof value === "string")
            converted[key] = ["true", "1", "yes"].includes(value.toLowerCase());
          else converted[key] = Boolean(value);
        } else converted[key] = value;
      } catch {
        converted[key] = value;
      }
    }
    return converted;
  }

  // ---------------------------------------------------------------------------
  // System prompt
  // ---------------------------------------------------------------------------

  private getSystemPrompt(): string {
    const base = this.systemPrompt ?? "你是一个可靠的AI助理，能够在需要时调用工具完成任务。";
    if (!this.enableToolCalling || !this.toolRegistry) return base;
    const desc = this.toolRegistry.getAvailableTools();
    if (!desc || desc === "暂无可用工具") return base;
    return [
      base,
      "",
      "## 可用工具",
      "当你判断需要外部信息或执行动作时，可以直接通过函数调用使用以下工具：",
      desc,
      "",
      "请主动决定是否调用工具，合理利用多次调用来获得完备答案。",
    ].join("\n");
  }

  // ---------------------------------------------------------------------------
  // run()
  // ---------------------------------------------------------------------------

  async run(
    inputText: string,
    options: { maxToolIterations?: number; toolChoice?: ToolChoice; temperature?: number } = {},
  ): Promise<string> {
    const traceId = this.createTraceId();
    await this.emitHook("beforeRun", {
      traceId,
      inputText,
      metadata: { mode: "run", agent: "function-call" },
    });

    try {
      const messages: ChatMessage[] = [
        { role: "system", content: this.getSystemPrompt() },
        ...this.history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user", content: inputText },
      ];

      const toolSchemas = this.buildToolSchemas();
      const executor = new ToolCallExecutor({
        llm: this.llm,
        maxIterations: options.maxToolIterations ?? this.maxToolIterations,
        config: this.config,
      });

      await this.emitHook("beforeLLMCall", {
        traceId,
        inputText,
        llmRequest: { messages, tools: toolSchemas, temperature: options.temperature },
      });

      const result = await executor.run({
        messages,
        tools: toolSchemas,
        toolChoice: options.toolChoice ?? this.defaultToolChoice,
        temperature: options.temperature,
        executor: async (name, args) => {
          const converted = this.convertParameterTypes(name, args);
          await this.emitHook("beforeToolCall", {
            traceId,
            inputText,
            toolName: name,
            toolInput: converted,
          });
          const output = await this.toolRegistry!.execute(name, converted);
          await this.emitHook("afterToolCall", {
            traceId,
            inputText,
            toolName: name,
            toolInput: converted,
            toolOutput: output,
          });
          return output;
        },
        onBeforeToolCall: undefined,
        onAfterToolCall: undefined,
      });

      await this.emitHook("afterLLMCall", {
        traceId,
        inputText,
        llmResponse: { outputText: result.output },
      });

      this.addMessage(createAgentMessage("user", inputText));
      this.addMessage(createAgentMessage("assistant", result.output));

      await this.emitHook("afterRun", {
        traceId,
        inputText,
        outputText: result.output,
        metadata: { mode: "run" },
      });

      return result.output;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      await this.emitHook("onError", { traceId, inputText, error: err, metadata: { mode: "run" } });
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // streamRun()
  // ---------------------------------------------------------------------------

  async *streamRun(
    inputText: string,
    options: { maxToolIterations?: number; toolChoice?: ToolChoice; temperature?: number } = {},
  ): AsyncGenerator<string> {
    const messages: ChatMessage[] = [
      { role: "system", content: this.getSystemPrompt() },
      ...this.history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user", content: inputText },
    ];

    const toolSchemas = this.buildToolSchemas();
    const executor = new ToolCallExecutor({
      llm: this.llm,
      maxIterations: options.maxToolIterations ?? this.maxToolIterations,
      config: this.config,
    });

    let full = "";
    for await (const chunk of executor.stream({
      messages,
      tools: toolSchemas,
      toolChoice: options.toolChoice ?? this.defaultToolChoice,
      temperature: options.temperature,
      executor: (name, args) =>
        this.toolRegistry!.execute(name, this.convertParameterTypes(name, args)),
    })) {
      full += chunk;
      yield chunk;
    }

    this.addMessage(createAgentMessage("user", inputText));
    this.addMessage(createAgentMessage("assistant", full));
  }

  // ---------------------------------------------------------------------------
  // Tool management API
  // ---------------------------------------------------------------------------

  addTool(tool: Tool): void {
    this.toolRegistry?.registerTool(tool);
  }

  removeTool(toolName: string): boolean {
    return this.toolRegistry?.unregisterTool(toolName) ?? false;
  }

  listTools(): string[] {
    return this.toolRegistry?.listTools() ?? [];
  }

  hasTools(): boolean {
    return this.enableToolCalling && this.toolRegistry !== undefined;
  }
}
