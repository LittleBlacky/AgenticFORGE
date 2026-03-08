import {Agent} from "../../core/agent";
import type {LLMMessage} from "../../core/types";
import {Message} from "../../core/message";
import type {ToolParameter, FunctionTool} from "../../tools/Tool";
import {ToolRegistry} from "../../tools/ToolRegistry";
import {Tool} from "../../tools/Tool";

/**
 * 表示从模型输出中解析出的单次工具调用。
 */
interface ToolCall {
  /** 工具名，例如：calculator_multiply */
  toolName: string;
  /** 原始参数 JSON 字符串，例如：{"a":12,"b":8} */
  parameters: string;
  /** 完整原始片段，例如：{"name":"calculator_multiply","arguments":{"a":12,"b":8}} */
  original: string;
}

/**
 * 简单智能体实现：
 * - 支持常规对话
 * - 支持在模型输出中识别并执行工具调用
 * - 支持同步与流式两种运行模式
 */
export class SimpleAgent extends Agent {
  /** 工具注册表（可选）。未配置时仅执行纯对话。 */
  private toolRegistry?: ToolRegistry;

  /** 是否启用工具调用能力。 */
  private enableToolCalling: boolean;

  constructor(params: {
    name: string;
    llm: Agent["llm"];
    systemPrompt?: string;
    config?: Agent["config"];
    tools?: Array<Tool | FunctionTool<any>>;
    enableToolCalling?: boolean;
  }) {
    super({
      name: params.name,
      llm: params.llm,
      systemPrompt: params.systemPrompt,
      config: params.config,
    });

    const tools = params.tools ?? [];
    if (tools.length > 0) {
      const registry = new ToolRegistry();
      for (const tool of tools) {
        if (tool instanceof Tool) {
          registry.registerTool(tool);
        } else {
          registry.registerFunction(
            tool.name,
            tool.description,
            tool.func,
            tool.schema,
          );
        }
      }
      this.toolRegistry = registry;
    }

    // 仅当“显式开启”且“存在可用工具”时，工具调用才会启用。
    this.enableToolCalling =
      (params.enableToolCalling ?? true) && this.toolRegistry !== undefined;
  }

  /**
   * 构建增强版系统提示词：
   * - 在基础 system prompt 上注入可用工具列表
   * - 约束模型使用统一工具调用格式
   */
  private getEnhancedSystemPrompt(): string {
    const basePrompt = this.systemPrompt ?? "你是一个有用的AI助手。";

    if (!this.enableToolCalling || !this.toolRegistry) {
      return basePrompt;
    }

    const toolsDescription = this.toolRegistry.getAvailableTools();
    if (!toolsDescription || toolsDescription.trim().length === 0) {
      return basePrompt;
    }

    let toolsSection = "\n\n【系统提示】\n";
    toolsSection += "你是一个 AI 助手，可以调用以下工具来帮助用户：\n\n";
    toolsSection += `${toolsDescription}\n\n`;

    toolsSection +=
      "当用户的问题需要外部信息、计算、检索或执行操作时，请优先判断是否应调用工具。\n";
    toolsSection +=
      "若需要调用工具，请使用 JSON 格式输出调用指令（不要添加额外解释文本）：\n";
    toolsSection +=
      '`{"name": "工具名", "arguments": {"参数名": "参数值"}}`\n\n';

    toolsSection += "规则：\n";
    toolsSection += "- name 必须是可用工具中的精确名称。\n";
    toolsSection += "- arguments 的 key 必须与工具参数名一致。\n";
    toolsSection += "- 数值参数请使用数值类型，不要写成字符串。\n";
    toolsSection += "- 若当前问题不需要工具，请直接正常回答。\n";

    return basePrompt + toolsSection;
  }

  /**
   * 从模型回复中提取工具调用片段。
   * 仅识别 JSON 格式：{"name":"tool_name","arguments":{...}}
   */
  private parseToolCalls(text: string): ToolCall[] {
    return this.extractJsonToolCalls(text);
  }

  /**
   * 提取 JSON 格式工具调用。
   */
  private extractJsonToolCalls(text: string): ToolCall[] {
    const calls: ToolCall[] = [];
    const startToken = '{"name"';
    let cursor = 0;

    while (cursor < text.length) {
      const start = text.indexOf(startToken, cursor);
      if (start === -1) break;

      const end = this.findJsonObjectEnd(text, start);
      if (end === -1) break;

      const candidate = text.slice(start, end + 1);
      try {
        const parsed = JSON.parse(candidate) as {
          name?: unknown;
          arguments?: unknown;
        };

        if (typeof parsed.name === "string") {
          const toolName = parsed.name.trim();
          const argsRaw = parsed.arguments;
          const parameters =
            argsRaw !== undefined ? JSON.stringify(argsRaw) : "{}";

          if (toolName.length > 0) {
            calls.push({toolName, parameters, original: candidate});
          }
        }
      } catch {
        // 不是合法 JSON 调用，忽略并继续向后搜索。
      }

      cursor = end + 1;
    }

    return calls;
  }

  /**
   * 从指定位置查找 JSON 对象结束位置。
   */
  private findJsonObjectEnd(text: string, startIdx: number): number {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = startIdx; i < text.length; i += 1) {
      const ch = text[i];

      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
        continue;
      }

      if (ch === "{") {
        depth += 1;
      } else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          return i;
        }
      }
    }

    return -1;
  }

  /**
   * 执行单次工具调用并统一返回字符串结果。
   */
  private async executeToolCall(
    toolName: string,
    parameters: string,
  ): Promise<string> {
    if (!this.toolRegistry) {
      return "❌ 错误：未配置工具注册表";
    }

    try {
      // JSON arguments 转换为工具可消费的对象参数，
      // 并统一走 ToolRegistry.execute，以同时支持 Tool 与函数工具。
      const paramDict = this.parseToolParameters(toolName, parameters);
      const result = await this.toolRegistry.execute(toolName, paramDict);
      return `🔧 工具 ${toolName} 执行结果：\n${String(result)}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `❌ 工具调用失败：${message}`;
    }
  }

  /**
   * 解析工具参数（仅支持 JSON arguments）。
   */
  private parseToolParameters(
    toolName: string,
    parameters: string,
  ): Record<string, unknown> {
    const trimmed = parameters.trim();

    if (!trimmed) {
      return {};
    }

    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return this.convertParameterTypes(
          toolName,
          parsed as Record<string, unknown>,
        );
      }
      throw new Error("arguments 必须是 JSON 对象");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`工具参数必须是合法 JSON 对象: ${message}`);
    }
  }

  /**
   * 按工具参数元数据将字符串值转换为 number/integer/boolean 等类型。
   */
  private convertParameterTypes(
    toolName: string,
    paramDict: Record<string, unknown>,
  ): Record<string, unknown> {
    if (!this.toolRegistry) {
      return paramDict;
    }

    const tool = this.toolRegistry.getTool(toolName);
    if (!tool) {
      return paramDict;
    }

    let toolParams: ToolParameter[];
    try {
      toolParams = tool.getParameters();
    } catch {
      return paramDict;
    }

    const paramTypes = new Map(toolParams.map((p) => [p.name, p.type]));
    const converted: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(paramDict)) {
      const type = paramTypes.get(key);
      if (!type) {
        converted[key] = value;
        continue;
      }

      try {
        if (type === "number") {
          converted[key] =
            typeof value === "string" ? Number.parseFloat(value) : value;
        } else if (type === "integer") {
          converted[key] =
            typeof value === "string" ? Number.parseInt(value, 10) : value;
        } else if (type === "boolean") {
          if (typeof value === "string") {
            converted[key] = ["true", "1", "yes"].includes(value.toLowerCase());
          } else {
            converted[key] = Boolean(value);
          }
        } else {
          converted[key] = value;
        }
      } catch {
        // 转换失败时保留原值，避免中断工具调用流程。
        converted[key] = value;
      }
    }

    return converted;
  }

  /**
   * 组装发送给 LLM 的消息序列：
   * system prompt + 历史消息 + 当前用户输入。
   */
  private buildMessages(inputText: string): LLMMessage[] {
    const messages: LLMMessage[] = [];

    const enhancedSystemPrompt = this.getEnhancedSystemPrompt();
    messages.push({role: "system", content: enhancedSystemPrompt});

    for (const msg of this.history) {
      if (
        msg.role === "user" ||
        msg.role === "assistant" ||
        msg.role === "system"
      ) {
        messages.push({role: msg.role, content: msg.content});
      }
    }

    messages.push({role: "user", content: inputText});
    return messages;
  }

  /**
   * 动态注册工具，并自动开启工具调用能力。
   */
  addTool(
    tool: Parameters<NonNullable<ToolRegistry["registerTool"]>>[0],
  ): void {
    if (!this.toolRegistry) {
      return;
    }
    this.toolRegistry.registerTool(tool);
    this.enableToolCalling = true;
  }

  /**
   * 移除工具（当前未实现）。
   */
  removeTool(_toolName: string): boolean {
    if (this.toolRegistry) {
      this.toolRegistry.unregisterTool(_toolName);
      return true;
    }
    return false;
  }

  /**
   * 返回当前注册的工具名列表。
   */
  listTools(): string[] {
    if (!this.toolRegistry) {
      return [];
    }
    return this.toolRegistry.getAllTools().map((tool) => tool.name);
  }

  /**
   * 当前智能体是否具备可用工具能力。
   */
  hasTools(): boolean {
    return this.enableToolCalling && this.toolRegistry !== undefined;
  }

  /**
   * 同步运行入口：
   * - 如未启用工具：直接一次 LLM 推理并返回
   * - 如启用工具：循环解析并执行工具调用，直到得到最终回答或达到迭代上限
   */
  async run(
    inputText: string,
    options: {maxToolIterations?: number; temperature?: number} = {},
  ): Promise<string> {
    const maxToolIterations = options.maxToolIterations ?? 10;
    const temperature = options.temperature ?? this.config.temperature;

    const messages = this.buildMessages(inputText);

    if (!this.enableToolCalling) {
      const response = await this.llm.think(messages, temperature);
      this.addMessage(new Message({content: inputText, role: "user"}));
      this.addMessage(new Message({content: response, role: "assistant"}));
      return response;
    }

    let currentIteration = 0;
    let finalResponse = "";

    while (currentIteration < maxToolIterations) {
      const response = await this.llm.think(messages, temperature);
      const toolCalls = this.parseToolCalls(response);

      if (toolCalls.length > 0) {
        const toolResults: string[] = [];
        let cleanResponse = response;

        for (const call of toolCalls) {
          console.log(call);
          const result = await this.executeToolCall(
            call.toolName,
            call.parameters,
          );
          console.log(result);
          toolResults.push(result);
          // 移除工具调用标记，避免把“指令文本”再次喂给模型。
          cleanResponse = cleanResponse.replace(call.original, "");
        }

        // 先把（去掉工具调用标记后的）助手文本加入上下文。
        messages.push({role: "assistant", content: cleanResponse});
        // 再以“用户消息”形式反馈工具执行结果，请模型综合生成最终答案。
        messages.push({
          role: "user",
          content: `工具执行结果：\n${toolResults.join("\n\n")}\n\n请基于这些结果给出完整的回答。`,
        });

        currentIteration += 1;
        continue;
      }

      finalResponse = response;
      break;
    }

    // 达到迭代上限仍未产出最终回答时，做一次兜底推理。
    if (currentIteration >= maxToolIterations && !finalResponse) {
      finalResponse = await this.llm.think(messages, temperature);
    }

    // 将本轮用户输入与助手最终回答写入历史。
    this.addMessage(new Message({content: inputText, role: "user"}));
    this.addMessage(new Message({content: finalResponse, role: "assistant"}));

    return finalResponse;
  }

  /**
   * 流式运行入口：
   * - 无工具场景：直接透传流式 token
   * - 有工具场景：先做非流式工具规划，再在最终回答阶段进行流式输出
   */
  async *streamRun(
    inputText: string,
    options: {maxToolIterations?: number; temperature?: number} = {},
  ): AsyncGenerator<string> {
    const maxToolIterations = options.maxToolIterations ?? 10;
    const temperature = options.temperature ?? this.config.temperature;
    const messages = this.buildMessages(inputText);

    if (!this.enableToolCalling) {
      let fullResponse = "";
      for await (const chunk of this.llm.streamThink(messages, temperature)) {
        fullResponse += chunk;
        yield chunk;
      }

      this.addMessage(new Message({content: inputText, role: "user"}));
      this.addMessage(new Message({content: fullResponse, role: "assistant"}));
      return;
    }

    let currentIteration = 0;

    while (currentIteration < maxToolIterations) {
      const response = await this.llm.think(messages, temperature);
      const toolCalls = this.parseToolCalls(response);

      if (toolCalls.length === 0) {
        let finalResponse = "";
        for await (const chunk of this.llm.streamThink(messages, temperature)) {
          finalResponse += chunk;
          yield chunk;
        }

        this.addMessage(new Message({content: inputText, role: "user"}));
        this.addMessage(
          new Message({content: finalResponse, role: "assistant"}),
        );
        return;
      }

      const toolResults: string[] = [];
      let cleanResponse = response;

      for (const call of toolCalls) {
        const result = await this.executeToolCall(
          call.toolName,
          call.parameters,
        );
        toolResults.push(result);
        cleanResponse = cleanResponse.replace(call.original, "");
      }

      messages.push({role: "assistant", content: cleanResponse});
      messages.push({
        role: "user",
        content: `工具执行结果：\n${toolResults.join("\n\n")}\n\n请基于这些结果给出完整的回答。`,
      });

      currentIteration += 1;
    }

    // 超过工具迭代上限后的兜底流式输出。
    let fallbackResponse = "";
    for await (const chunk of this.llm.streamThink(messages, temperature)) {
      fallbackResponse += chunk;
      yield chunk;
    }

    this.addMessage(new Message({content: inputText, role: "user"}));
    this.addMessage(
      new Message({content: fallbackResponse, role: "assistant"}),
    );
  }
}

