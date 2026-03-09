import {Agent} from "../../core/agent";
import {Message} from "../../core/message";
import type {AgentRuntimeOptions} from "../types";
import {Planner} from "./Plan";
import {Executor} from "./Executor";
import {
  EXECUTOR_PROMPT_TEMPLATE,
  PLAN_PROMPT_TEMPLATE,
} from "./prompts";

export interface PlanSolvePrompts {
  planner: string;
  executor: string;
}

export class PlanSolveAgent extends Agent {
  private readonly planner: Planner;
  private readonly executor: Executor;

  constructor(params: {
    name: string;
    llm: Agent["llm"];
    systemPrompt?: string;
    config?: Agent["config"];
    customPrompts?: Partial<PlanSolvePrompts>;
  }) {
    super({
      name: params.name,
      llm: params.llm,
      systemPrompt: params.systemPrompt,
      config: params.config,
    });

    const plannerPrompt = params.customPrompts?.planner ?? PLAN_PROMPT_TEMPLATE;
    const executorPrompt =
      params.customPrompts?.executor ?? EXECUTOR_PROMPT_TEMPLATE;

    this.planner = new Planner(this.llm, plannerPrompt);
    this.executor = new Executor(this.llm, executorPrompt);
  }

  async run(
    inputText: string,
    options: AgentRuntimeOptions = {},
  ): Promise<string> {
    console.log(`\n🤖 ${this.name} 开始处理问题: ${inputText}`);

    const plan = await this.planner.plan(inputText, options);

    if (!plan || plan.length === 0) {
      const finalAnswer = "无法生成有效的行动计划，任务终止。";
      console.log(`\n--- 任务终止 ---\n${finalAnswer}`);

      this.addMessage(new Message({role: "user", content: inputText}));
      this.addMessage(new Message({role: "assistant", content: finalAnswer}));

      return finalAnswer;
    }

    const finalAnswer = await this.executor.execute(inputText, plan, options);
    console.log(`\n--- 任务完成 ---\n最终答案: ${finalAnswer}`);

    this.addMessage(new Message({role: "user", content: inputText}));
    this.addMessage(new Message({role: "assistant", content: finalAnswer}));

    return finalAnswer;
  }
}
