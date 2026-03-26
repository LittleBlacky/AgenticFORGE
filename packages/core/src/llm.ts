import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { LLMMessage, LLMOptions, StreamMode, StreamChunk } from "./types";

function toChatMessages(messages: LLMMessage[]): ChatCompletionMessageParam[] {
  return messages.map((message) => {
    if (message.role === "tool") {
      return {
        role: "tool",
        content: message.content,
        tool_call_id: "tool_call_id",
      } satisfies ChatCompletionMessageParam;
    }
    return {
      role: message.role,
      content: message.content,
    } satisfies ChatCompletionMessageParam;
  });
}

export class LLMClient {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(options: LLMOptions = {}) {
    const model = options.model ?? process.env.LLM_MODEL_ID;
    const apiKey = options.apiKey ?? process.env.LLM_API_KEY;
    const baseURL = options.baseURL ?? process.env.LLM_BASE_URL;
    const timeoutMs = options.timeoutMs ?? Number(process.env.LLM_TIMEOUT ?? 60) * 1000;

    if (!model || !apiKey || !baseURL) {
      throw new Error("LLM_MODEL_ID, LLM_API_KEY, LLM_BASE_URL 必须在参数或 .env 中提供");
    }

    this.model = model;
    this.client = new OpenAI({
      apiKey,
      baseURL,
      timeout: timeoutMs,
    });
  }

  async think(messages: LLMMessage[], temperature = 0): Promise<string> {
    let fullText = "";
    for await (const chunk of this.streamThink(messages, temperature)) {
      fullText += chunk;
    }
    return fullText;
  }

  /**
   * 流式输出正文（向后兼容，默认只 yield content delta）。
   * streamMode 控制输出范围：
   * - "content-only"  只 yield 正文（默认）
   * - "thinking-only" 只 yield thinking token
   * - "all"           先 yield thinking token，再 yield 正文
   */
  async *streamThink(
    messages: LLMMessage[],
    temperature = 0,
    streamMode: StreamMode = "content-only",
  ): AsyncGenerator<string> {
    for await (const chunk of this.streamThinkChunked(messages, temperature)) {
      if (streamMode === "content-only" && chunk.type === "content") {
        yield chunk.text;
      } else if (streamMode === "thinking-only" && chunk.type === "thinking") {
        yield chunk.text;
      } else if (streamMode === "all") {
        yield chunk.text;
      }
    }
  }

  /**
   * 流式输出，每个 chunk 携带类型标记（"thinking" | "content"）。
   * 适用于需要区分思考过程和最终回答的场景（DeepSeek R1、Claude 等思考模型）。
   *
   * 使用示例：
   * ```ts
   * for await (const chunk of llm.streamThinkChunked(messages)) {
   *   if (chunk.type === "thinking") {
   *     process.stdout.write(`\x1b[2m${chunk.text}\x1b[0m`); // 灰色显示思考
   *   } else {
   *     process.stdout.write(chunk.text); // 正常显示回答
   *   }
   * }
   * ```
   */
  async *streamThinkChunked(messages: LLMMessage[], temperature = 0): AsyncGenerator<StreamChunk> {
    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages: toChatMessages(messages),
      temperature,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta as Record<string, unknown> | undefined;
      if (!delta) continue;

      // 思考模型（DeepSeek R1 / Claude 等）的 reasoning_content 字段
      const thinking = delta["reasoning_content"];
      if (typeof thinking === "string" && thinking.length > 0) {
        yield { type: "thinking", text: thinking };
      }

      // 正文 content
      const content = delta["content"];
      if (typeof content === "string" && content.length > 0) {
        yield { type: "content", text: content };
      }
    }
  }
}
