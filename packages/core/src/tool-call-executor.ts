import type { LLMClient } from "./llm";
import type { Config } from "./config";

// ---------------------------------------------------------------------------
// ToolCallExecutor — 共享的 function calling 执行内核
// ---------------------------------------------------------------------------
//
// 封装了 OpenAI function calling 协议的完整循环：
//   1. 构建消息数组
//   2. 调用 LLM（带 tools schema）
//   3. 解析 tool_calls
//   4. 执行工具
//   5. 追加 tool 结果消息
//   6. 循环直到 LLM 不再调用工具，或达到最大迭代次数
//
// 所有需要 function calling 的地方（FunctionCallAgent、AgentSkill 等）
// 都应该用这个内核，而不是各自维护重复实现。

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  name?: string;
  tool_calls?: ToolCallItem[];
};

export type ToolCallItem = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type ToolSchema = Record<string, unknown>;

export type ToolExecutorFn = (toolName: string, args: Record<string, unknown>) => Promise<string>;

export interface ToolCallExecutorOptions {
  /** LLM 客户端实例 */
  llm: LLMClient;
  /** 最大工具调用迭代次数，默认 10 */
  maxIterations?: number;
  /** Agent 配置（用于读取 temperature 等） */
  config?: Config;
}

export interface ToolCallRunOptions {
  /** 工具 schema 列表（OpenAI function calling 格式） */
  tools: ToolSchema[];
  /** 工具执行函数 */
  executor: ToolExecutorFn;
  /** 初始消息数组 */
  messages: ChatMessage[];
  /** 覆盖温度参数 */
  temperature?: number;
  /** 工具选择策略，默认 "auto" */
  toolChoice?: "auto" | "none" | { type: "function"; function: { name: string } };
  /** 最大迭代次数（覆盖构造时的设置） */
  maxIterations?: number;
  /** 每次工具调用前的回调（用于 hooks） */
  onBeforeToolCall?: (toolName: string, args: Record<string, unknown>) => Promise<void>;
  /** 每次工具调用后的回调（用于 hooks） */
  onAfterToolCall?: (
    toolName: string,
    args: Record<string, unknown>,
    result: string,
  ) => Promise<void>;
}

export interface ToolCallResult {
  /** 最终输出文本 */
  output: string;
  /** 所有消息（含工具调用历史） */
  messages: ChatMessage[];
  /** 调用过的工具名列表 */
  toolsUsed: string[];
}

/**
 * 共享的 function calling 执行内核。
 *
 * 所有需要工具调用的 Agent 和 Skill 都应通过这个类执行，
 * 避免在各处重复实现 OpenAI function calling 协议。
 *
 * @example
 * ```ts
 * const executor = new ToolCallExecutor({ llm, maxIterations: 10 });
 *
 * const result = await executor.run({
 *   tools: registry.getOpenAISchemas(),
 *   executor: (name, args) => registry.execute(name, args),
 *   messages: [
 *     { role: "system", content: "You are a helpful assistant." },
 *     { role: "user", content: userQuery },
 *   ],
 * });
 *
 * console.log(result.output);
 * console.log(result.toolsUsed);
 * ```
 */
export class ToolCallExecutor {
  private readonly llm: LLMClient;
  private readonly defaultMaxIterations: number;
  private readonly config?: Config;

  constructor(options: ToolCallExecutorOptions) {
    this.llm = options.llm;
    this.defaultMaxIterations = options.maxIterations ?? 10;
    this.config = options.config;
  }

  /**
   * 执行完整的 function calling 循环。
   * 无工具时直接走单次 LLM 调用。
   */
  async run(options: ToolCallRunOptions): Promise<ToolCallResult> {
    const messages = [...options.messages];
    const toolsUsed: string[] = [];

    // 无工具 — 直接调用 LLM
    if (options.tools.length === 0) {
      const output = await this.llm.think(
        messages as Array<{ role: "system" | "user" | "assistant"; content: string }>,
        options.temperature,
      );
      return { output, messages, toolsUsed };
    }

    const maxIter = options.maxIterations ?? this.defaultMaxIterations;
    const toolChoice = options.toolChoice ?? "auto";
    const client = this.getOpenAIClient();
    const model = this.getModel();
    const temperature = options.temperature ?? this.getTemperature();

    let finalOutput = "";

    for (let i = 0; i < maxIter; i++) {
      const response = await client.chat.completions.create({
        model,
        messages,
        tools: options.tools,
        tool_choice: toolChoice,
        temperature,
        stream: false,
      });

      const msg = response.choices?.[0]?.message;
      const content = ToolCallExecutor.extractContent(msg?.content);
      const toolCalls: ToolCallItem[] = Array.isArray(msg?.tool_calls) ? msg.tool_calls : [];

      if (toolCalls.length === 0) {
        // LLM 不再调用工具，输出最终结果
        finalOutput = content;
        messages.push({ role: "assistant", content: finalOutput });
        break;
      }

      // 追加 assistant 消息（含 tool_calls）
      messages.push({ role: "assistant", content, tool_calls: toolCalls });

      // 执行所有工具调用
      for (const call of toolCalls) {
        const toolName = call.function.name;
        const args = ToolCallExecutor.parseArgs(call.function.arguments);

        toolsUsed.push(toolName);

        await options.onBeforeToolCall?.(toolName, args);

        let result: string;
        try {
          result = await options.executor(toolName, args);
        } catch (e) {
          result = `Error: ${e instanceof Error ? e.message : String(e)}`;
        }

        await options.onAfterToolCall?.(toolName, args, result);

        messages.push({
          role: "tool",
          tool_call_id: call.id,
          name: toolName,
          content: result,
        });
      }
    }

    // 达到最大迭代次数仍未得到最终结果，强制一次无工具调用
    if (!finalOutput) {
      const response = await client.chat.completions.create({
        model,
        messages,
        tools: options.tools,
        tool_choice: "none",
        temperature,
        stream: false,
      });
      finalOutput = ToolCallExecutor.extractContent(response.choices?.[0]?.message?.content);
      messages.push({ role: "assistant", content: finalOutput });
    }

    return { output: finalOutput, messages, toolsUsed };
  }

  /**
   * 流式执行：工具调用循环非流式，最终输出流式 yield。
   */
  async *stream(options: ToolCallRunOptions): AsyncGenerator<string> {
    const messages = [...options.messages];

    // 无工具 — 直接流式输出
    if (options.tools.length === 0) {
      for await (const chunk of this.llm.streamThink(
        messages as Array<{ role: "system" | "user" | "assistant"; content: string }>,
        options.temperature,
      )) {
        yield chunk;
      }
      return;
    }

    const maxIter = options.maxIterations ?? this.defaultMaxIterations;
    const toolChoice = options.toolChoice ?? "auto";
    const client = this.getOpenAIClient();
    const model = this.getModel();
    const temperature = options.temperature ?? this.getTemperature();

    // 工具调用循环（非流式）
    for (let i = 0; i < maxIter; i++) {
      const response = await client.chat.completions.create({
        model,
        messages,
        tools: options.tools,
        tool_choice: toolChoice,
        temperature,
        stream: false,
      });

      const msg = response.choices?.[0]?.message;
      const content = ToolCallExecutor.extractContent(msg?.content);
      const toolCalls: ToolCallItem[] = Array.isArray(msg?.tool_calls) ? msg.tool_calls : [];

      if (toolCalls.length === 0) break;

      messages.push({ role: "assistant", content, tool_calls: toolCalls });

      for (const call of toolCalls) {
        const toolName = call.function.name;
        const args = ToolCallExecutor.parseArgs(call.function.arguments);

        await options.onBeforeToolCall?.(toolName, args);
        let result: string;
        try {
          result = await options.executor(toolName, args);
        } catch (e) {
          result = `Error: ${e instanceof Error ? e.message : String(e)}`;
        }
        await options.onAfterToolCall?.(toolName, args, result);

        messages.push({
          role: "tool",
          tool_call_id: call.id,
          name: toolName,
          content: result,
        });
      }
    }

    // 流式输出最终合成回答
    const streamClient = client as unknown as {
      chat: {
        completions: {
          create: (p: Record<string, unknown>) => Promise<
            AsyncIterable<{
              choices: Array<{ delta: { content?: string } }>;
            }>
          >;
        };
      };
    };

    const streamResponse = await streamClient.chat.completions.create({
      model,
      messages,
      tools: options.tools,
      tool_choice: "none",
      temperature,
      stream: true,
    });

    for await (const chunk of streamResponse) {
      const text = chunk.choices[0]?.delta?.content;
      if (typeof text === "string" && text.length > 0) {
        yield text;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 私有方法
  // ---------------------------------------------------------------------------

  private getOpenAIClient(): {
    chat: {
      completions: {
        create: (p: Record<string, unknown>) => Promise<{
          choices: Array<{
            message?: {
              content?: unknown;
              tool_calls?: ToolCallItem[];
            };
          }>;
        }>;
      };
    };
  } {
    const client = (this.llm as unknown as Record<string, unknown>).client;
    if (!client) {
      throw new Error(
        "[ToolCallExecutor] LLMClient does not expose underlying OpenAI client (.client). " +
          "LLMClient 未暴露底层 OpenAI 客户端（.client 属性）。" +
          "请确保使用 @agenticforge/core 的内置 LLMClient。",
      );
    }
    return client as ReturnType<ToolCallExecutor["getOpenAIClient"]>;
  }

  private getModel(): string {
    const model = (this.llm as unknown as Record<string, unknown>).model;
    if (typeof model !== "string" || !model) {
      throw new Error("[ToolCallExecutor] LLMClient 未暴露 model 属性。");
    }
    return model;
  }

  private getTemperature(): number | undefined {
    if (!this.config) return undefined;
    return (this.config as unknown as Record<string, unknown>).temperature as number | undefined;
  }

  private static extractContent(raw: unknown): string {
    if (raw === null || raw === undefined) return "";
    if (typeof raw === "string") return raw;
    if (Array.isArray(raw)) {
      return raw
        .filter((item): item is { text: string } => typeof item?.text === "string")
        .map((item) => item.text)
        .join("");
    }
    return String(raw);
  }

  private static parseArgs(argumentsText?: string): Record<string, unknown> {
    if (!argumentsText) return {};
    try {
      const parsed = JSON.parse(argumentsText) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return {};
    } catch {
      return {};
    }
  }
}
