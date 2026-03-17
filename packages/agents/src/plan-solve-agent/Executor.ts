import {LLMClient} from "@AgenticKIT/core";
import {ToolRegistry} from "@AgenticKIT/tools";
import type {PlanStep} from "./Plan";
import {buildStepPrompt} from "./prompts";

export interface StepExecutorOptions {
  llm: LLMClient;
  toolRegistry?: ToolRegistry;
}

/**
 * Executes individual plan steps, optionally delegating to tools.
 */
export class StepExecutor {
  private readonly llm: LLMClient;
  private readonly toolRegistry?: ToolRegistry;

  constructor(options: StepExecutorOptions) {
    this.llm = options.llm;
    this.toolRegistry = options.toolRegistry;
  }

  async execute(step: PlanStep, context = ""): Promise<string> {
    if (step.tool && this.toolRegistry?.hasTool(step.tool)) {
      try {
        return await this.toolRegistry.execute(step.tool, {input: step.description});
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return `工具执行失败 (${step.tool}): ${msg}`;
      }
    }

    const prompt = buildStepPrompt(step.description, context);
    return this.llm.think([
      {role: "system", content: "你是一个专注执行具体任务的AI助手，直接给出结果。"},
      {role: "user", content: prompt},
    ]);
  }
}
