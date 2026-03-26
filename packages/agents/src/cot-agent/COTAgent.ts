import { Agent, createAgentMessage } from "@agenticforge/core";
import {
  COT_SYSTEM_PROMPT,
  buildCotPrompt,
  parseCotOutput,
  type CotParseResult,
  type CotStep,
} from "./prompts";

export interface COTAgentOptions {
  name: string;
  llm: Agent["llm"];
  systemPrompt?: string;
  config?: Agent["config"];
  /**
   * 最大思考步骤数。COT 是单次 LLM 调用，模型自行决定步骤数。
   * 此配置用于后处理截断，防止异常长输出。默认 20。
   */
  maxSteps?: number;
  /** 打印推理链到控制台。默认 false。 */
  verbose?: boolean;
}

export interface CotTrace {
  inputText: string;
  steps: CotStep[];
  finalAnswer: string;
  rawOutput: string;
}

/**
 * COTAgent — Chain of Thought 推理智能体。
 *
 * 工作方式：
 * 1. 构建强制分步推理的系统提示词。
 * 2. 单次 LLM 调用，要求模型输出"思考步骤 N + 最终答案"格式。
 * 3. 解析模型输出，提取各步骤与最终答案。
 * 4. 支持 streamRun() 逐 token 流式输出，同时解析完整推理链。
 *
 * 相比 ReActAgent：COTAgent 不调用外部工具，专注于纯语言推理。
 * 相比 ReflectionAgent：COTAgent 单轮完成，不做生成→批评→修订循环。
 *
 * 适用场景：数学推理、逻辑题、多步文字问题、需要可解释推理的场景。
 */
export class COTAgent extends Agent {
  private readonly maxSteps: number;
  private readonly verbose: boolean;
  private lastTrace?: CotTrace;

  constructor(options: COTAgentOptions) {
    super({
      name: options.name,
      llm: options.llm,
      systemPrompt: options.systemPrompt ?? COT_SYSTEM_PROMPT,
      config: options.config,
    });
    this.maxSteps = options.maxSteps ?? 20;
    this.verbose = options.verbose ?? false;
  }

  async run(inputText: string): Promise<string> {
    const traceId = this.createTraceId();
    await this.emitHook("beforeRun", {
      traceId,
      inputText,
      metadata: { mode: "run", agent: "cot" },
    });

    try {
      const messages = this.buildMessages(inputText);

      await this.emitHook("beforeLLMCall", {
        traceId,
        inputText,
        llmRequest: { messages, mode: "run" },
      });

      const raw = await this.llm.think(messages);

      await this.emitHook("afterLLMCall", {
        traceId,
        inputText,
        llmResponse: { raw, mode: "run" },
      });

      const parsed = this.parseAndTruncate(raw);
      this.lastTrace = { inputText, ...parsed };

      if (this.verbose) {
        this.printTrace(parsed);
      }

      this.addMessage(createAgentMessage("user", inputText));
      this.addMessage(createAgentMessage("assistant", parsed.finalAnswer));

      await this.emitHook("afterRun", {
        traceId,
        inputText,
        outputText: parsed.finalAnswer,
        metadata: { mode: "run" },
      });

      return parsed.finalAnswer;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      await this.emitHook("onError", {
        traceId,
        inputText,
        error: err,
        metadata: { mode: "run" },
      });
      throw err;
    }
  }

  /**
   * 流式运行：逐 token yield，推理完成后解析步骤并存入 lastTrace。
   */
  async *streamRun(inputText: string, options?: { temperature?: number }): AsyncGenerator<string> {
    const traceId = this.createTraceId();
    await this.emitHook("beforeRun", {
      traceId,
      inputText,
      metadata: { mode: "stream", agent: "cot" },
    });

    const messages = this.buildMessages(inputText);

    await this.emitHook("beforeLLMCall", {
      traceId,
      inputText,
      llmRequest: { messages, temperature: options?.temperature, mode: "stream" },
    });

    let fullOutput = "";
    try {
      for await (const chunk of this.llm.streamThink(messages, options?.temperature)) {
        fullOutput += chunk;
        yield chunk;
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      await this.emitHook("onError", {
        traceId,
        inputText,
        error: err,
        metadata: { mode: "stream" },
      });
      throw err;
    }

    await this.emitHook("afterLLMCall", {
      traceId,
      inputText,
      llmResponse: { raw: fullOutput, mode: "stream" },
    });

    const parsed = this.parseAndTruncate(fullOutput);
    this.lastTrace = { inputText, ...parsed };

    if (this.verbose) {
      this.printTrace(parsed);
    }

    this.addMessage(createAgentMessage("user", inputText));
    this.addMessage(createAgentMessage("assistant", parsed.finalAnswer));

    await this.emitHook("afterRun", {
      traceId,
      inputText,
      outputText: parsed.finalAnswer,
      metadata: { mode: "stream" },
    });
  }

  // ─── 公共查询接口 ────────────────────────────────────────────────────────────

  /** 获取最近一次运行的完整推理链（包含步骤与最终答案）。 */
  getLastTrace(): CotTrace | undefined {
    return this.lastTrace;
  }

  /** 获取最近一次运行的推理步骤列表。 */
  getSteps(): CotStep[] {
    return this.lastTrace?.steps ?? [];
  }

  /** 获取最近一次运行解析出的最终答案（未加入历史的原始文本）。 */
  getLastFinalAnswer(): string | undefined {
    return this.lastTrace?.finalAnswer;
  }

  // ─── 私有工具 ────────────────────────────────────────────────────────────────

  private buildMessages(
    inputText: string,
  ): Array<{ role: "system" | "user" | "assistant"; content: string }> {
    const messages: Array<{
      role: "system" | "user" | "assistant";
      content: string;
    }> = [];

    messages.push({
      role: "system",
      content: this.systemPrompt ?? COT_SYSTEM_PROMPT,
    });

    // 携带对话历史（多轮场景）
    for (const msg of this.history) {
      if (msg.role === "user" || msg.role === "assistant" || msg.role === "system") {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    messages.push({ role: "user", content: buildCotPrompt(inputText) });
    return messages;
  }

  private parseAndTruncate(raw: string): CotParseResult {
    const parsed = parseCotOutput(raw);
    // 按 maxSteps 截断步骤（防止异常长输出）
    if (parsed.steps.length > this.maxSteps) {
      parsed.steps = parsed.steps.slice(0, this.maxSteps);
    }
    return parsed;
  }

  private printTrace(parsed: CotParseResult): void {
    console.log("\n[COTAgent] 推理链：");
    for (const step of parsed.steps) {
      console.log(`  步骤 ${step.stepNumber}: ${step.content}`);
    }
    console.log(`[COTAgent] 最终答案: ${parsed.finalAnswer}\n`);
  }
}
