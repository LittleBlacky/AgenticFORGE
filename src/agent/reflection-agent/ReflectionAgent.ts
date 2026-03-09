import {Agent} from "../../core/agent";
import {Message} from "../../core/message";
import {Memory} from "./Memory";

export interface ReflectionPrompts {
  initial: string;
  reflect: string;
  refine: string;
}

const DEFAULT_PROMPTS: ReflectionPrompts = {
  initial: `
请根据以下要求完成任务：

任务: {task}

请提供一个完整、准确的回答。
`,
  reflect: `
请仔细审查以下回答，并找出可能的问题或改进空间：

# 原始任务:
{task}

# 当前回答:
{content}

请分析这个回答的质量，指出不足之处，并提出具体的改进建议。
如果回答已经很好，请回答"无需改进"。
`,
  refine: `
请根据反馈意见改进你的回答：

# 原始任务:
{task}

# 上一轮回答:
{last_attempt}

# 反馈意见:
{feedback}

请提供一个改进后的回答。
`,
};

export class ReflectionAgent extends Agent {
  private memory: Memory;
  private readonly maxIterations: number;
  private readonly prompts: ReflectionPrompts;

  constructor(params: {
    name: string;
    llm: Agent["llm"];
    systemPrompt?: string;
    config?: Agent["config"];
    maxIterations?: number;
    customPrompts?: Partial<ReflectionPrompts>;
  }) {
    super({
      name: params.name,
      llm: params.llm,
      systemPrompt: params.systemPrompt,
      config: params.config,
    });

    this.maxIterations = params.maxIterations ?? 3;
    this.memory = new Memory();
    this.prompts = {
      ...DEFAULT_PROMPTS,
      ...(params.customPrompts ?? {}),
    };
  }

  async run(
    inputText: string,
    options: {temperature?: number} = {},
  ): Promise<string> {
    console.log(`\n🤖 ${this.name} 开始处理任务: ${inputText}`);

    this.memory = new Memory();

    console.log("\n--- 正在进行初始尝试 ---");
    const initialPrompt = this.formatPrompt(this.prompts.initial, {
      task: inputText,
    });
    const initialResult = await this.getLLMResponse(initialPrompt, options);
    this.memory.addRecord("execution", initialResult);

    for (let i = 0; i < this.maxIterations; i += 1) {
      console.log(`\n--- 第 ${i + 1}/${this.maxIterations} 轮迭代 ---`);

      console.log("\n-> 正在进行反思...");
      const lastResult = this.memory.getLastExecution() ?? "";
      const reflectPrompt = this.formatPrompt(this.prompts.reflect, {
        task: inputText,
        content: lastResult,
      });
      const feedback = await this.getLLMResponse(reflectPrompt, options);
      this.memory.addRecord("reflection", feedback);

      if (
        feedback.includes("无需改进") ||
        feedback.toLowerCase().includes("no need for improvement")
      ) {
        console.log("\n✅ 反思认为结果已无需改进，任务完成。");
        break;
      }

      console.log("\n-> 正在进行优化...");
      const refinePrompt = this.formatPrompt(this.prompts.refine, {
        task: inputText,
        last_attempt: lastResult,
        feedback,
      });
      const refinedResult = await this.getLLMResponse(refinePrompt, options);
      this.memory.addRecord("execution", refinedResult);
    }

    const finalResult = this.memory.getLastExecution() ?? "";
    console.log(`\n--- 任务完成 ---\n最终结果:\n${finalResult}`);

    this.addMessage(new Message({role: "user", content: inputText}));
    this.addMessage(new Message({role: "assistant", content: finalResult}));

    return finalResult;
  }

  private formatPrompt(
    template: string,
    variables: Record<string, string>,
  ): string {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replaceAll(`{${key}}`, value);
    }
    return result;
  }

  private async getLLMResponse(
    prompt: string,
    options: {temperature?: number} = {},
  ): Promise<string> {
    const messages = [{role: "user" as const, content: prompt}];
    return (
      (await this.llm.think(messages, options.temperature ?? this.config.temperature)) ||
      ""
    );
  }
}
