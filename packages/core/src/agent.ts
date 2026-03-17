import {Message} from "./message";
import {LLMClient} from "./llm";
import {Config} from "./config";
import {z, type ZodType} from "zod";

/** Agent 基类 */
export abstract class Agent {
  protected readonly name: string;
  protected readonly llm: LLMClient;
  protected readonly systemPrompt?: string;
  protected readonly config: Config;
  protected readonly history: Message[] = [];

  constructor(params: {
    name: string;
    llm: LLMClient;
    systemPrompt?: string;
    config?: Config;
  }) {
    this.name = params.name;
    this.llm = params.llm;
    this.systemPrompt = params.systemPrompt;
    this.config = params.config ?? new Config();
  }

  /** 运行 Agent */
  abstract run(inputText: string, ...args: unknown[]): Promise<string> | string;

  /** 添加消息到历史记录 */
  addMessage(message: Message): void {
    this.history.push(message);
  }

  /** 清空历史记录 */
  clearHistory(): void {
    this.history.length = 0;
  }

  /** 获取历史记录 */
  getHistory(): Message[] {
    return [...this.history];
  }

  /**
   * 结构化输出入口：
   * - 通过 schema 约束模型返回 JSON
   * - 自动从回复中提取 JSON 并进行校验
   */
  async runStructured<T>(params: {
    inputText: string;
    schema: ZodType<T>;
    instruction?: string;
    maxRetries?: number;
    options?: unknown;
  }): Promise<T> {
    const autoInstruction = this.buildStructuredInstructionFromSchema(
      params.schema,
    );
    const instruction = params.instruction ?? autoInstruction;
    const maxRetries = Math.max(0, params.maxRetries ?? 2);

    let prompt = `${params.inputText}\n\n${instruction}`;
    let lastRaw = "";
    let lastError = "";

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const raw = await this.run(prompt, params.options);
      const rawText = String(raw);
      lastRaw = rawText;
      const jsonText = this.extractJsonBlock(rawText);

      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonText);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        lastError = `JSON 解析失败: ${message}`;

        if (attempt < maxRetries) {
          prompt = [
            params.inputText,
            instruction,
            "你上一次输出不是合法 JSON。",
            `错误：${lastError}`,
            "请只返回修正后的 JSON，不要额外文本。",
          ].join("\n\n");
          continue;
        }

        throw new Error(
          `结构化输出 JSON 解析失败: ${message}。原始输出: ${rawText}`,
        );
      }

      const validation = params.schema.safeParse(parsed);
      if (validation.success) {
        return validation.data;
      }

      lastError = validation.error.message;
      if (attempt < maxRetries) {
        prompt = [
          params.inputText,
          instruction,
          "你上一次输出不符合 schema。",
          `校验错误：${lastError}`,
          "请只返回修正后的 JSON，字段名与类型必须严格匹配。",
        ].join("\n\n");
        continue;
      }
    }

    throw new Error(
      `结构化输出 schema 校验失败（已重试 ${maxRetries} 次）: ${lastError}。原始输出: ${lastRaw}`,
    );
  }

  /**
   * 根据 Zod schema 自动生成结构化输出提示词。
   */
  protected buildStructuredInstructionFromSchema<T>(schema: ZodType<T>): string {
    const jsonSchema = z.toJSONSchema(schema, {target: "draft-7"});
    return [
      "请严格只返回 JSON，不要包含解释、Markdown 代码块或额外文本。",
      "输出必须严格符合以下 JSON Schema：",
      JSON.stringify(jsonSchema, null, 2),
      "字段名、字段类型、必填项必须完全匹配。",
    ].join("\n\n");
  }

  /**
   * 从文本中提取 JSON 主体：
   * - 支持 ```json ... ``` 包裹
   * - 支持纯 JSON 文本
   */
  protected extractJsonBlock(text: string): string {
    const trimmed = text.trim();

    const fenced = trimmed.match(/```json\s*([\s\S]*?)\s*```/i);
    if (fenced && fenced[1]) {
      return fenced[1].trim();
    }

    if (
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    ) {
      return trimmed;
    }

    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return trimmed.slice(firstBrace, lastBrace + 1);
    }

    const firstBracket = trimmed.indexOf("[");
    const lastBracket = trimmed.lastIndexOf("]");
    if (firstBracket >= 0 && lastBracket > firstBracket) {
      return trimmed.slice(firstBracket, lastBracket + 1);
    }

    return trimmed;
  }

  toString(): string {
    const provider = this.config.defaultProvider;
    return `Agent(name=${this.name}, provider=${provider})`;
  }
}
