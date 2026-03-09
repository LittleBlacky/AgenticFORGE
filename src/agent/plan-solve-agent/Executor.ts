import {LLMClient} from "../../core/llm";
import type {AgentRuntimeOptions} from "../types";
import type {LLMMessage} from "../../core/types";
import {EXECUTOR_PROMPT_TEMPLATE} from "./prompts";
import {formatPrompt} from "../../utils";

export class Executor {
  constructor(
    private readonly llmClient: LLMClient,
    private readonly promptTemplate: string = EXECUTOR_PROMPT_TEMPLATE,
  ) {}

  async execute(
    question: string,
    plan: string[],
    options: AgentRuntimeOptions = {},
  ): Promise<string> {
    if (plan.length === 0) {
      console.error("❌ 计划为空，无法执行。");
      return "";
    }

    let history = "";
    let finalAnswer = "";

    console.log("\n--- 正在执行计划 ---");

    for (const [index, step] of plan.entries()) {
      console.log(`\n-> 正在执行步骤 ${index + 1}/${plan.length}: ${step}`);

      const prompt = formatPrompt(this.promptTemplate, {
        question,
        plan: JSON.stringify(plan, null, 2),
        history: history || "无",
        current_step: step,
      });

      const messages: LLMMessage[] = [{role: "user", content: prompt}];
      const responseText =
        (await this.llmClient.think(messages, options.temperature ?? 0)) || "";

      history += `步骤 ${index + 1}: ${step}\n结果: ${responseText}\n\n`;
      finalAnswer = responseText;

      console.log(`✅ 步骤 ${index + 1} 已完成，结果: ${finalAnswer}`);
    }

    return finalAnswer;
  }
}
