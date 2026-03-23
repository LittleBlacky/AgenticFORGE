import {Agent} from "@agenticforge/core";
import {Message} from "@agenticforge/core";
import {ToolRegistry} from "@agenticforge/tools";
import type {AgentStep} from "../types";

export interface ReActAgentOptions {
  name: string;
  llm: Agent["llm"];
  systemPrompt?: string;
  config?: Agent["config"];
  toolRegistry?: ToolRegistry;
  maxSteps?: number;
  verbose?: boolean;
}

const REACT_SYSTEM = `你是一个ReAct智能体，按照Thought/Action/Observation循环解决问题。

格式：
Thought: <你的思考>
Action: <工具名称>
Action Input: <工具输入>
Observation: <工具返回结果>
... (重复上述循环)
Final Answer: <最终答案>`;

/**
 * ReAct (Reasoning + Acting) Agent.
 * Interleaves chain-of-thought reasoning with tool invocations.
 */
export class ReActAgent extends Agent {
  private readonly toolRegistry?: ToolRegistry;
  private readonly maxSteps: number;
  private readonly verbose: boolean;
  private readonly steps: AgentStep[] = [];

  constructor(options: ReActAgentOptions) {
    super({
      name: options.name,
      llm: options.llm,
      systemPrompt: options.systemPrompt ?? REACT_SYSTEM,
      config: options.config,
    });
    this.toolRegistry = options.toolRegistry;
    this.maxSteps = options.maxSteps ?? 8;
    this.verbose = options.verbose ?? false;
  }

  async run(inputText: string): Promise<string> {
    const traceId = this.createTraceId();
    await this.emitHook("beforeRun", {traceId, inputText, metadata: {mode: "run", agent: "react"}});

    try {
      this.steps.length = 0;

      const toolDescriptions = this.toolRegistry
        ? this.toolRegistry.getAvailableTools()
        : "（无可用工具）";

      const systemContent = [
        this.systemPrompt ?? REACT_SYSTEM,
        "",
        "可用工具：",
        toolDescriptions,
      ].join("\n");

      const messages: Array<{role: "system" | "user" | "assistant"; content: string}> = [
        {role: "system", content: systemContent},
        {role: "user", content: inputText},
      ];

      let scratchpad = "";

      for (let step = 0; step < this.maxSteps; step++) {
        const promptMessages = scratchpad
          ? [...messages, {role: "assistant" as const, content: scratchpad}]
          : messages;

        await this.emitHook("beforeLLMCall", {traceId, inputText, llmRequest: {promptMessages, step}});
        const raw = await this.llm.think(promptMessages);
        await this.emitHook("afterLLMCall", {traceId, inputText, llmResponse: {raw, step}});
        scratchpad += (scratchpad ? "\n" : "") + raw;

        if (this.verbose) console.log(`[ReAct step ${step + 1}]\n${raw}`);

        const finalMatch = raw.match(/Final\s+Answer\s*:\s*([\s\S]+)/i);
        if (finalMatch) {
          const answer = finalMatch[1]!.trim();
          this.steps.push({thought: raw, isFinal: true, finalAnswer: answer});
          this.addMessage(new Message({role: "user", content: inputText}));
          this.addMessage(new Message({role: "assistant", content: answer}));
          await this.emitHook("afterRun", {traceId, inputText, outputText: answer, metadata: {mode: "run"}});
          return answer;
        }

        const actionMatch = raw.match(/Action\s*:\s*(.+)/i);
        const actionInputMatch = raw.match(/Action\s+Input\s*:\s*([\s\S]*?)(?=\nObservation:|\nThought:|\nAction:|\nFinal|$)/i);

        if (actionMatch && this.toolRegistry) {
          const toolName = actionMatch[1]!.trim();
          const toolInput = actionInputMatch ? actionInputMatch[1]!.trim() : "";

          await this.emitHook("beforeToolCall", {traceId, inputText, toolName, toolInput: {input: toolInput}});
          let observation: string;
          try {
            observation = await this.toolRegistry.execute(toolName, {input: toolInput});
          } catch (e) {
            observation = `Error: ${e instanceof Error ? e.message : String(e)}`;
          }
          await this.emitHook("afterToolCall", {traceId, inputText, toolName, toolInput: {input: toolInput}, toolOutput: observation});

          if (this.verbose) console.log(`[ReAct observation] ${observation}`);
          scratchpad += `\nObservation: ${observation}`;
          this.steps.push({thought: raw, action: toolName, actionInput: toolInput, observation, isFinal: false});
        } else {
          this.steps.push({thought: raw, isFinal: true, finalAnswer: raw});
          this.addMessage(new Message({role: "user", content: inputText}));
          this.addMessage(new Message({role: "assistant", content: raw}));
          await this.emitHook("afterRun", {traceId, inputText, outputText: raw, metadata: {mode: "run"}});
          return raw;
        }
      }

      const lastStep = this.steps[this.steps.length - 1];
      const fallback = lastStep?.finalAnswer ?? lastStep?.observation ?? inputText;
      this.addMessage(new Message({role: "user", content: inputText}));
      this.addMessage(new Message({role: "assistant", content: fallback}));
      await this.emitHook("afterRun", {traceId, inputText, outputText: fallback, metadata: {mode: "run"}});
      return fallback;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      await this.emitHook("onError", {traceId, inputText, error: err, metadata: {mode: "run"}});
      throw err;
    }
  }

  getSteps(): AgentStep[] {
    return [...this.steps];
  }

  /**
   * Stream the final answer token by token.
   * The Thought/Action/Observation loop runs synchronously (tool results must
   * be awaited), and only the last "Final Answer" synthesis is streamed.
   */
  async *streamRun(inputText: string, options?: {temperature?: number}): AsyncGenerator<string> {
    this.steps.length = 0;

    const toolDescriptions = this.toolRegistry
      ? this.toolRegistry.getAvailableTools()
      : "（无可用工具）";

    const systemContent = [
      this.systemPrompt ?? REACT_SYSTEM,
      "",
      "可用工具：",
      toolDescriptions,
    ].join("\n");

    const messages: Array<{role: "system" | "user" | "assistant"; content: string}> = [
      {role: "system", content: systemContent},
      {role: "user", content: inputText},
    ];

    let scratchpad = "";
    let finalAnswer: string | undefined;

    for (let step = 0; step < this.maxSteps; step++) {
      const promptMessages = scratchpad
        ? [...messages, {role: "assistant" as const, content: scratchpad}]
        : messages;

      // Run each reasoning step non-streaming (we need to parse Thought/Action)
      const raw = await this.llm.think(promptMessages, options?.temperature);
      scratchpad += (scratchpad ? "\n" : "") + raw;

      if (this.verbose) console.log(`[ReAct step ${step + 1}]\n${raw}`);

      const finalMatch = raw.match(/Final\s+Answer\s*:\s*([\s\S]+)/i);
      if (finalMatch) {
        finalAnswer = finalMatch[1]!.trim();
        this.steps.push({thought: raw, isFinal: true, finalAnswer});
        break;
      }

      const actionMatch = raw.match(/Action\s*:\s*(.+)/i);
      const actionInputMatch = raw.match(/Action\s+Input\s*:\s*([\s\S]*?)(?=\nObservation:|\nThought:|\nAction:|\nFinal|$)/i);

      if (actionMatch && this.toolRegistry) {
        const toolName = actionMatch[1]!.trim();
        const toolInput = actionInputMatch ? actionInputMatch[1]!.trim() : "";

        let observation: string;
        try {
          observation = await this.toolRegistry.execute(toolName, {input: toolInput});
        } catch (e) {
          observation = `Error: ${e instanceof Error ? e.message : String(e)}`;
        }

        if (this.verbose) console.log(`[ReAct observation] ${observation}`);
        scratchpad += `\nObservation: ${observation}`;
        this.steps.push({thought: raw, action: toolName, actionInput: toolInput, observation, isFinal: false});
      } else {
        // No action and no final answer — treat raw as final answer
        finalAnswer = raw;
        this.steps.push({thought: raw, isFinal: true, finalAnswer: raw});
        break;
      }
    }

    // If we exhausted steps without a Final Answer, use last observation/thought
    if (finalAnswer === undefined) {
      const lastStep = this.steps[this.steps.length - 1];
      finalAnswer = lastStep?.finalAnswer ?? lastStep?.observation ?? inputText;
    }

    // Now stream the final answer token-by-token
    // We synthesise by asking the LLM to produce the final answer from the scratchpad
    const synthMessages: Array<{role: "system" | "user" | "assistant"; content: string}> = [
      ...messages,
      {role: "assistant", content: scratchpad},
      {
        role: "user",
        content: "根据以上推理过程，请直接给出最终答案（Final Answer 之后的内容），不要重复推理步骤。",
      },
    ];

    let fullResponse = "";
    for await (const chunk of this.llm.streamThink(synthMessages, options?.temperature)) {
      fullResponse += chunk;
      yield chunk;
    }

    this.addMessage(new Message({role: "user", content: inputText}));
    this.addMessage(new Message({role: "assistant", content: fullResponse || finalAnswer}));
  }
}
