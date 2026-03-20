import {z} from "zod";
import {Agent} from "@agenticforge/core";
import {Message} from "@agenticforge/core";
import type {FunctionTool} from "@agenticforge/tools";
import {ToolRegistry} from "@agenticforge/tools";

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
        this.toolRegistry.registerFunction(
          tool.name,
          tool.description,
          tool.func,
          tool.schema,
        );
      }
    }

    this.enableToolCalling =
      (options.enableToolCalling ?? true) && this.toolRegistry !== undefined;
    this.maxToolIterations = options.maxToolIterations ?? 3;
  }

  private buildToolSchemas(): Array<Record<string, unknown>> {
    if (!this.enableToolCalling || !this.toolRegistry) return [];
    return this.toolRegistry.getOpenAISchemas() as Array<Record<string, unknown>>;
  }

  private async invokeWithTools(
    messages: Array<Record<string, unknown>>,
    tools: Array<Record<string, unknown>>,
    toolChoice: "auto" | "none" = "auto",
    temperature?: number,
  ): Promise<Record<string, unknown>> {
    const client = (this.llm as unknown as Record<string, unknown>).client;
    const model = (this.llm as unknown as Record<string, unknown>).model;
    if (!client || !model) {
      throw new Error("LLMClient does not expose underlying OpenAI client");
    }
    return (client as {
      chat: {completions: {create: (p: Record<string, unknown>) => Promise<Record<string, unknown>>}};
    }).chat.completions.create({
      model,
      messages,
      tools,
      tool_choice: toolChoice,
      temperature: temperature ?? (this.config as unknown as Record<string, unknown>).temperature ?? 0,
      stream: false,
    });
  }

  async run(inputText: string, options?: {temperature?: number}): Promise<string> {
    const sys = this.systemPrompt ?? "你是一个简洁、高效的AI助手。";
    const messages: Array<Record<string, unknown>> = [
      {role: "system", content: sys},
      ...this.history.map((m) => ({role: m.role, content: m.content})),
      {role: "user", content: inputText},
    ];

    const toolSchemas = this.buildToolSchemas();
    if (toolSchemas.length === 0) {
      const response = await this.llm.think(
        messages as Array<{role: "system" | "user" | "assistant"; content: string}>,
        options?.temperature,
      );
      this.addMessage(new Message({role: "user", content: inputText}));
      this.addMessage(new Message({role: "assistant", content: response}));
      return response;
    }

    let finalResponse = "";
    for (let i = 0; i < this.maxToolIterations; i++) {
      const response = await this.invokeWithTools(
        messages,
        toolSchemas,
        "auto",
        options?.temperature,
      ) as {choices?: Array<{message?: {content?: string; tool_calls?: Array<{id: string; function: {name: string; arguments: string}}>}}>};

      const msg = response.choices?.[0]?.message;
      const content = msg?.content ?? "";
      const toolCalls = msg?.tool_calls ?? [];

      if (toolCalls.length === 0) {
        finalResponse = content;
        messages.push({role: "assistant", content});
        break;
      }

      messages.push({role: "assistant", content, tool_calls: toolCalls});

      for (const call of toolCalls) {
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(call.function.arguments) as Record<string, unknown>; } catch { /* ignore */ }
        let result = "";
        try {
          result = await this.toolRegistry!.execute(call.function.name, args);
        } catch (e) {
          result = `Error: ${e instanceof Error ? e.message : String(e)}`;
        }
        messages.push({role: "tool", tool_call_id: call.id, name: call.function.name, content: result});
      }
    }

    if (!finalResponse) {
      const last = await this.invokeWithTools(messages, toolSchemas, "none", options?.temperature) as {
        choices?: Array<{message?: {content?: string}}>;
      };
      finalResponse = last.choices?.[0]?.message?.content ?? "";
    }

    this.addMessage(new Message({role: "user", content: inputText}));
    this.addMessage(new Message({role: "assistant", content: finalResponse}));
    return finalResponse;
  }

}

export {z};
