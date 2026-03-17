import {Agent} from "@AgenticKIT/core";
import {Message} from "@AgenticKIT/core";
import {ToolRegistry} from "@AgenticKIT/tools";
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

      const raw = await this.llm.think(promptMessages);
      scratchpad += (scratchpad ? "\n" : "") + raw;

      if (this.verbose) console.log(`[ReAct step ${step + 1}]\n${raw}`);

      const finalMatch = raw.match(/Final\s+Answer\s*:\s*([\s\S]+)/i);
      if (finalMatch) {
        const answer = finalMatch[1]!.trim();
        this.steps.push({thought: raw, isFinal: true, finalAnswer: answer});
        this.addMessage(new Message({role: "user", content: inputText}));
        this.addMessage(new Message({role: "assistant", content: answer}));
        return answer;
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
        this.steps.push({thought: raw, isFinal: true, finalAnswer: raw});
        this.addMessage(new Message({role: "user", content: inputText}));
        this.addMessage(new Message({role: "assistant", content: raw}));
        return raw;
      }
    }

    const lastStep = this.steps[this.steps.length - 1];
    const fallback = lastStep?.finalAnswer ?? lastStep?.observation ?? inputText;
    this.addMessage(new Message({role: "user", content: inputText}));
    this.addMessage(new Message({role: "assistant", content: fallback}));
    return fallback;
  }

  getSteps(): AgentStep[] {
    return [...this.steps];
  }

  async *streamRun(inputText: string): AsyncGenerator<string> {
    yield await this.run(inputText);
  }
}
