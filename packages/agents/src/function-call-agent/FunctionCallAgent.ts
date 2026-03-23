import {z} from "zod";
import {Agent} from "@agenticforge/core";
import {Message} from "@agenticforge/core";
import {Tool, type FunctionTool, type OpenAIFunctionSchema} from "@agenticforge/tools";
import {ToolRegistry} from "@agenticforge/tools";

type ToolChoice = "auto" | "none" | {type: "function"; function: {name: string}};

function mapParameterType(paramType: string): string {
  const normalized = (paramType || "").toLowerCase();
  if (["string", "number", "integer", "boolean", "array", "object"].includes(normalized)) return normalized;
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
    super({name: params.name, llm: params.llm, systemPrompt: params.systemPrompt, config: params.config});
    if (params.toolRegistry) {
      this.toolRegistry = params.toolRegistry;
    } else if ((params.tools ?? []).length > 0) {
      const registry = new ToolRegistry();
      for (const tool of params.tools ?? []) {
        if (tool instanceof Tool) { registry.registerTool(tool); }
        else { registry.registerFunction(tool.name, tool.description, tool.func, tool.schema); }
      }
      this.toolRegistry = registry;
    }
    this.enableToolCalling = (params.enableToolCalling ?? true) && this.toolRegistry !== undefined;
    this.defaultToolChoice = params.defaultToolChoice ?? "auto";
    this.maxToolIterations = params.maxToolIterations ?? 3;
  }

  private getSystemPrompt(): string {
    const basePrompt = this.systemPrompt ?? "你是一个可靠的AI助理，能够在需要时调用工具完成任务。";
    if (!this.enableToolCalling || !this.toolRegistry) return basePrompt;
    const toolsDescription = this.toolRegistry.getAvailableTools();
    if (!toolsDescription || toolsDescription === "暂无可用工具") return basePrompt;
    return [basePrompt, "", "## 可用工具", "当你判断需要外部信息或执行动作时，可以直接通过函数调用使用以下工具：", toolsDescription, "", "请主动决定是否调用工具，合理利用多次调用来获得完备答案。"].join("\n");
  }

  private buildToolSchemas(): Array<OpenAIFunctionSchema | Record<string, unknown>> {
    if (!this.enableToolCalling || !this.toolRegistry) return [];
    const schemas: Array<OpenAIFunctionSchema | Record<string, unknown>> = [];
    for (const tool of this.toolRegistry.getAllTools()) schemas.push(tool.toOpenAISchema());
    const fnMap = (this.toolRegistry as any).functions as Map<string, FunctionTool<any>> | undefined;
    for (const [name, fnTool] of fnMap?.entries() ?? []) {
      let parameters: Record<string, unknown> = {type: "object", properties: {input: {type: "string", description: "输入文本"}}, required: ["input"]};
      if (fnTool.schema) { try { parameters = z.toJSONSchema(fnTool.schema, {target: "draft-7"}) as Record<string, unknown>; } catch {} }
      schemas.push({type: "function", function: {name, description: fnTool.description ?? "", parameters}});
    }
    return schemas;
  }
  private static extractMessageContent(rawContent: unknown): string {
    if (rawContent === null || rawContent === undefined) return "";
    if (typeof rawContent === "string") return rawContent;
    if (Array.isArray(rawContent)) {
      const parts: string[] = [];
      for (const item of rawContent) {
        if (typeof item === "object" && item !== null && "text" in item) {
          const text = (item as {text?: unknown}).text;
          if (typeof text === "string") parts.push(text);
        }
      }
      return parts.join("");
    }
    return String(rawContent);
  }

  private static parseFunctionCallArguments(argumentsText?: string): Record<string, unknown> {
    if (!argumentsText) return {};
    try {
      const parsed = JSON.parse(argumentsText) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
      return {};
    } catch { return {}; }
  }

  private convertParameterTypes(toolName: string, parameters: Record<string, unknown>): Record<string, unknown> {
    if (!this.toolRegistry) return parameters;
    const tool = this.toolRegistry.getTool(toolName);
    if (!tool) return parameters;
    let toolParams: ReturnType<Tool["getParameters"]>;
    try { toolParams = tool.getParameters(); } catch { return parameters; }
    const typeMap = new Map(toolParams.map((param) => [param.name, param.type]));
    const converted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parameters)) {
      const rawType = typeMap.get(key);
      if (!rawType) { converted[key] = value; continue; }
      const type = mapParameterType(rawType);
      try {
        if (type === "number") converted[key] = typeof value === "string" ? Number.parseFloat(value) : value;
        else if (type === "integer") converted[key] = typeof value === "string" ? Number.parseInt(value, 10) : value;
        else if (type === "boolean") {
          if (typeof value === "boolean") converted[key] = value;
          else if (typeof value === "string") converted[key] = ["true", "1", "yes"].includes(value.toLowerCase());
          else converted[key] = Boolean(value);
        } else converted[key] = value;
      } catch { converted[key] = value; }
    }
    return converted;
  }

  private async executeToolCall(toolName: string, argumentsDict: Record<string, unknown>): Promise<string> {
    if (!this.toolRegistry) return "❌ 错误：未配置工具注册表";
    try {
      return await this.toolRegistry.execute(toolName, this.convertParameterTypes(toolName, argumentsDict));
    } catch (error) {
      return "❌ 工具调用失败：" + (error instanceof Error ? error.message : String(error));
    }
  }

  private async invokeWithTools(
    messages: Array<Record<string, unknown>>,
    tools: Array<Record<string, unknown>>,
    toolChoice: ToolChoice,
    options: {temperature?: number} = {},
  ): Promise<any> {
    const client = (this.llm as any).client;
    const model = (this.llm as any).model;
    if (!client || !model) throw new Error("LLMClient 未暴露底层 OpenAI 客户端，无法执行函数调用。");
    return client.chat.completions.create({model, messages, tools, tool_choice: toolChoice,
      temperature: options.temperature ?? (this.config as unknown as Record<string, unknown>).temperature as number | undefined,
      stream: false});
  }
  async run(
    inputText: string,
    options: {maxToolIterations?: number; toolChoice?: ToolChoice; temperature?: number} = {},
  ): Promise<string> {
    const traceId = this.createTraceId();
    await this.emitHook("beforeRun", {traceId, inputText, metadata: {mode: "run", agent: "function-call"}});

    try {
      const messages: Array<Record<string, unknown>> = [];
      messages.push({role: "system", content: this.getSystemPrompt()});
      for (const msg of this.history) messages.push({role: msg.role, content: msg.content});
      messages.push({role: "user", content: inputText});
      const toolSchemas = this.buildToolSchemas();
      if (toolSchemas.length === 0) {
        await this.emitHook("beforeLLMCall", {
          traceId,
          inputText,
          llmRequest: {messages, temperature: options.temperature, mode: "non-tool"},
        });
        const response = await this.llm.think(
          messages as Array<{role: "system" | "user" | "assistant"; content: string}>,
          options.temperature ?? (this.config as unknown as Record<string, unknown>).temperature as number | undefined,
        );
        await this.emitHook("afterLLMCall", {
          traceId,
          inputText,
          llmResponse: {outputText: response, mode: "non-tool"},
        });
        this.addMessage(new Message({role: "user", content: inputText}));
        this.addMessage(new Message({role: "assistant", content: response}));
        await this.emitHook("afterRun", {traceId, inputText, outputText: response, metadata: {mode: "run"}});
        return response;
      }
      const iterationsLimit = options.maxToolIterations ?? this.maxToolIterations;
      const effectiveToolChoice = options.toolChoice ?? this.defaultToolChoice;
      let currentIteration = 0;
      let finalResponse = "";
      while (currentIteration < iterationsLimit) {
        await this.emitHook("beforeLLMCall", {
          traceId,
          inputText,
          llmRequest: {messages, tools: toolSchemas, toolChoice: effectiveToolChoice, temperature: options.temperature},
        });
        const response = await this.invokeWithTools(messages, toolSchemas as Array<Record<string, unknown>>, effectiveToolChoice, options);
        await this.emitHook("afterLLMCall", {traceId, inputText, llmResponse: response});
        const assistantMessage = response?.choices?.[0]?.message;
        const content = FunctionCallAgent.extractMessageContent(assistantMessage?.content);
        const toolCalls = Array.isArray(assistantMessage?.tool_calls) ? assistantMessage.tool_calls : [];
        if (toolCalls.length > 0) {
          messages.push({role: "assistant", content, tool_calls: toolCalls});
          for (const toolCall of toolCalls) {
            const toolName = toolCall?.function?.name;
            if (!toolName || typeof toolName !== "string") continue;
            const argsText = typeof toolCall?.function?.arguments === "string" ? toolCall.function.arguments : "";
            const parsedArgs = FunctionCallAgent.parseFunctionCallArguments(argsText);
            await this.emitHook("beforeToolCall", {traceId, inputText, toolName, toolInput: parsedArgs});
            const result = await this.executeToolCall(toolName, parsedArgs);
            await this.emitHook("afterToolCall", {traceId, inputText, toolName, toolInput: parsedArgs, toolOutput: result});
            messages.push({role: "tool", tool_call_id: toolCall.id, name: toolName, content: result});
          }
          currentIteration += 1;
          continue;
        }
        finalResponse = content;
        messages.push({role: "assistant", content: finalResponse});
        break;
      }
      if (currentIteration >= iterationsLimit && !finalResponse) {
        await this.emitHook("beforeLLMCall", {
          traceId,
          inputText,
          llmRequest: {messages, tools: toolSchemas, toolChoice: "none", temperature: options.temperature},
        });
        const finalTry = await this.invokeWithTools(messages, toolSchemas as Array<Record<string, unknown>>, "none", options);
        await this.emitHook("afterLLMCall", {traceId, inputText, llmResponse: finalTry});
        finalResponse = FunctionCallAgent.extractMessageContent(finalTry?.choices?.[0]?.message?.content);
        messages.push({role: "assistant", content: finalResponse});
      }
      this.addMessage(new Message({role: "user", content: inputText}));
      this.addMessage(new Message({role: "assistant", content: finalResponse}));
      await this.emitHook("afterRun", {traceId, inputText, outputText: finalResponse, metadata: {mode: "run"}});
      return finalResponse;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      await this.emitHook("onError", {traceId, inputText, error: err, metadata: {mode: "run"}});
      throw err;
    }
  }

  addTool(tool: Tool): void { if (this.toolRegistry) this.toolRegistry.registerTool(tool); }
  removeTool(toolName: string): boolean { return this.toolRegistry?.unregisterTool(toolName) ?? false; }
  listTools(): string[] { return this.toolRegistry?.listTools() ?? []; }
  hasTools(): boolean { return this.enableToolCalling && this.toolRegistry !== undefined; }
  async *streamRun(
    inputText: string,
    options: {maxToolIterations?: number; toolChoice?: ToolChoice; temperature?: number} = {},
  ): AsyncGenerator<string> {
    const messages: Array<Record<string, unknown>> = [];
    messages.push({role: "system", content: this.getSystemPrompt()});
    for (const msg of this.history) messages.push({role: msg.role, content: msg.content});
    messages.push({role: "user", content: inputText});
    const toolSchemas = this.buildToolSchemas();

    // No tools — stream the single LLM call directly
    if (toolSchemas.length === 0) {
      let full = "";
      for await (const chunk of this.llm.streamThink(
        messages as Array<{role: "system" | "user" | "assistant"; content: string}>, options.temperature,
      )) { full += chunk; yield chunk; }
      this.addMessage(new Message({role: "user", content: inputText}));
      this.addMessage(new Message({role: "assistant", content: full}));
      return;
    }

    // Run tool-call loop non-streaming, then stream the final synthesis call
    const iterationsLimit = options.maxToolIterations ?? this.maxToolIterations;
    const effectiveToolChoice = options.toolChoice ?? this.defaultToolChoice;
    let currentIteration = 0;
    let reachedLimit = false;

    while (currentIteration < iterationsLimit) {
      const response = await this.invokeWithTools(messages, toolSchemas as Array<Record<string, unknown>>, effectiveToolChoice, options);
      const assistantMessage = response?.choices?.[0]?.message;
      const content = FunctionCallAgent.extractMessageContent(assistantMessage?.content);
      const toolCalls = Array.isArray(assistantMessage?.tool_calls) ? assistantMessage.tool_calls : [];
      if (toolCalls.length === 0) break;
      messages.push({role: "assistant", content, tool_calls: toolCalls});
      for (const toolCall of toolCalls) {
        const toolName = toolCall?.function?.name;
        if (!toolName || typeof toolName !== "string") continue;
        const argsText = typeof toolCall?.function?.arguments === "string" ? toolCall.function.arguments : "";
        const result = await this.executeToolCall(toolName, FunctionCallAgent.parseFunctionCallArguments(argsText));
        messages.push({role: "tool", tool_call_id: toolCall.id, name: toolName, content: result});
      }
      currentIteration += 1;
      if (currentIteration >= iterationsLimit) reachedLimit = true;
    }

    // Stream the final answer via raw OpenAI client with stream: true
    const client = (this.llm as any).client as {
      chat: {completions: {create: (p: Record<string, unknown>) => Promise<AsyncIterable<{choices: Array<{delta: {content?: string}}>}>>}};
    };
    const model = (this.llm as any).model as string;
    const streamPayload: Record<string, unknown> = {model, messages, temperature: options.temperature ?? 0, stream: true};
    if (!reachedLimit) { streamPayload.tools = toolSchemas; streamPayload.tool_choice = "none"; }
    const streamResponse = await client.chat.completions.create(streamPayload);

    let full = "";
    for await (const chunk of streamResponse) {
      const text = chunk.choices[0]?.delta?.content;
      if (typeof text === "string" && text.length > 0) { full += text; yield text; }
    }
    this.addMessage(new Message({role: "user", content: inputText}));
    this.addMessage(new Message({role: "assistant", content: full}));
  }
}
