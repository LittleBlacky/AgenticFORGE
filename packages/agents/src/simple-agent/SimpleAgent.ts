import { z } from "zod";
import { Agent, Message, ToolCallExecutor, createAgentMessage } from "@agenticforge/core";
import type { FunctionTool } from "@agenticforge/tools";
import { ToolRegistry } from "@agenticforge/tools";

export interface SimpleAgentOptions {
  name: string;
  llm: Agent["llm"];
  systemPrompt?: string;
  config?: Agent["config"];
  tools?: Array<FunctionTool<Record<string, unknown>>>;
  enableToolCalling?: boolean;
  maxToolIterations?: number;
}

/**
 * A simple agent that optionally uses function tools via OpenAI function-calling.
 * Function calling loop is delegated to ToolCallExecutor.
 */
export class SimpleAgent extends Agent {
  private readonly toolRegistry?: ToolRegistry;
  private readonly enableToolCalling: boolean;
  private readonly maxToolIterations: number;

  constructor(options: SimpleAgentOptions) {
    super({
      name: options.name,
      llm: options.llm,
      systemPrompt: options.systemPrompt,
      config: options.config,
    });

    if ((options.tools ?? []).length > 0) {
      this.toolRegistry = new ToolRegistry();
      for (const tool of options.tools ?? []) {
        this.toolRegistry.registerFunction(tool.name, tool.description, tool.func, tool.schema);
      }
    }

    this.enableToolCalling = (options.enableToolCalling ?? true) && this.toolRegistry !== undefined;
    this.maxToolIterations = options.maxToolIterations ?? 3;
  }

  async run(inputText: string, options?: { temperature?: number }): Promise<string> {
    const traceId = this.createTraceId();
    await this.emitHook("beforeRun", {
      traceId,
      inputText,
      metadata: { mode: "run", agent: "simple" },
    });

    try {
      const sys = this.systemPrompt ?? "你是一个简洁、高效的AI助手。";
      const messages = [
        { role: "system" as const, content: sys },
        ...this.history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user" as const, content: inputText },
      ];

      const executor = new ToolCallExecutor({
        llm: this.llm,
        maxIterations: this.maxToolIterations,
        config: this.config,
      });

      const schemas =
        this.enableToolCalling && this.toolRegistry
          ? (this.toolRegistry.getOpenAISchemas() as Record<string, unknown>[])
          : [];

      await this.emitHook("beforeLLMCall", {
        traceId,
        inputText,
        llmRequest: { messages, tools: schemas, temperature: options?.temperature },
      });

      const result = await executor.run({
        messages,
        tools: schemas,
        executor: async (name, args) => {
          await this.emitHook("beforeToolCall", {
            traceId,
            inputText,
            toolName: name,
            toolInput: args,
          });
          const output = await this.toolRegistry!.execute(name, args);
          await this.emitHook("afterToolCall", {
            traceId,
            inputText,
            toolName: name,
            toolInput: args,
            toolOutput: output,
          });
          return output;
        },
        temperature: options?.temperature,
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

  async *streamRun(inputText: string, options?: { temperature?: number }): AsyncGenerator<string> {
    const sys = this.systemPrompt ?? "你是一个简洁、高效的AI助手。";
    const messages = [
      { role: "system" as const, content: sys },
      ...this.history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user" as const, content: inputText },
    ];

    const schemas =
      this.enableToolCalling && this.toolRegistry
        ? (this.toolRegistry.getOpenAISchemas() as Record<string, unknown>[])
        : [];

    const executor = new ToolCallExecutor({
      llm: this.llm,
      maxIterations: this.maxToolIterations,
      config: this.config,
    });

    let full = "";
    for await (const chunk of executor.stream({
      messages,
      tools: schemas,
      executor: (name, args) => this.toolRegistry!.execute(name, args),
      temperature: options?.temperature,
    })) {
      full += chunk;
      yield chunk;
    }

    this.addMessage(createAgentMessage("user", inputText));
    this.addMessage(createAgentMessage("assistant", full));
  }
}

export { z };
