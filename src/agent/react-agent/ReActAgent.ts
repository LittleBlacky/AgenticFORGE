import {Agent} from "../../core/agent";
import {Message} from "../../core/message";
import {Tool, type FunctionTool} from "../../tools/Tool";
import {ToolRegistry} from "../../tools/ToolRegistry";

const DEFAULT_REACT_PROMPT = `你是一个具备推理和行动能力的AI助手。你可以通过思考分析问题，然后调用合适的工具来获取信息，最终给出准确的答案。

## 可用工具
{tools}

## 工作流程
请严格按照以下格式进行回应，每次只能执行一个步骤：

Thought: 分析问题，确定需要什么信息，制定研究策略。
Action: 选择合适的工具获取信息，格式为：
- {tool_name}[{tool_input}]：调用工具获取信息。
- Finish[研究结论]：当你有足够信息得出结论时。

## 重要提醒
1. 每次回应必须包含Thought和Action两部分
2. 工具调用的格式必须严格遵循：工具名[参数]
3. 只有当你确信有足够信息回答问题时，才使用Finish
4. 如果工具返回的信息不够，继续使用其他工具或相同工具的不同参数

## 当前任务
**Question:** {question}

## 执行历史
{history}

现在开始你的推理和行动：`;

export class ReActAgent extends Agent {
  private readonly toolRegistry: ToolRegistry;
  private readonly maxSteps: number;
  private readonly promptTemplate: string;
  private currentHistory: string[] = [];

  constructor(params: {
    name: string;
    llm: Agent["llm"];
    systemPrompt?: string;
    config?: Agent["config"];
    toolRegistry?: ToolRegistry;
    tools?: Array<Tool | FunctionTool<any>>;
    maxSteps?: number;
    customPrompt?: string;
  }) {
    super({
      name: params.name,
      llm: params.llm,
      systemPrompt: params.systemPrompt,
      config: params.config,
    });

    this.toolRegistry = params.toolRegistry ?? new ToolRegistry();
    this.maxSteps = params.maxSteps ?? 5;
    this.promptTemplate = params.customPrompt ?? DEFAULT_REACT_PROMPT;

    const tools = params.tools ?? [];
    for (const tool of tools) {
      if (tool instanceof Tool) {
        this.toolRegistry.registerTool(tool);
      } else {
        this.toolRegistry.registerFunction(
          tool.name,
          tool.description,
          tool.func,
          tool.schema,
        );
      }
    }
  }

  addTool(tool: Tool): void {
    this.toolRegistry.registerTool(tool);
  }

  private formatPrompt(inputText: string): string {
    const tools = this.toolRegistry.getAvailableTools() || "无可用工具";
    const history = this.currentHistory.length
      ? this.currentHistory.join("\n")
      : "无";

    return this.promptTemplate
      .replaceAll("{tools}", tools)
      .replaceAll("{question}", inputText)
      .replaceAll("{history}", history);
  }

  private parseOutput(text: string): {
    thought: string | null;
    action: string | null;
  } {
    const thoughtMatch = text.match(/Thought:\s*(.*?)(?=\nAction:|$)/s);
    const actionMatch = text.match(/Action:\s*(.*?)(?:\n|$)/s);

    return {
      thought: thoughtMatch ? thoughtMatch[1].trim() : null,
      action: actionMatch ? actionMatch[1].trim() : null,
    };
  }

  private parseAction(actionText: string): {
    toolName: string | null;
    toolInput: string | null;
  } {
    const match = actionText.match(/^(\w+)\[(.*)\]$/s);
    if (!match) {
      return {toolName: null, toolInput: null};
    }
    return {toolName: match[1], toolInput: match[2]};
  }

  private parseActionInput(actionText: string): string {
    const match = actionText.match(/^\w+\[(.*)\]$/s);
    return match ? match[1] : "";
  }

  private async executeTool(
    toolName: string,
    toolInput: string,
  ): Promise<string> {
    try {
      // ReAct 模板沿用 tool[input] 风格，这里统一映射到 registry 的对象参数。
      return await this.toolRegistry.execute(toolName, {input: toolInput});
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `工具执行失败: ${message}`;
    }
  }

  private async summarizeFromHistory(
    inputText: string,
    options: {temperature?: number} = {},
  ): Promise<string> {
    const history = this.currentHistory.length
      ? this.currentHistory.join("\n")
      : "无可总结内容";

    const summaryPrompt = [
      "你是一个负责总结研究过程的助手。",
      "请基于已完成步骤的 Action/Observation，给出一个简洁、可信的阶段性结论。",
      "要求：",
      "1) 仅基于提供的历史，不要编造未出现的信息。",
      "2) 先给出已知结论，再说明仍不确定/待补充点。",
      `原始问题：${inputText}`,
      "已执行历史：",
      history,
    ].join("\n\n");

    return this.llm.think(
      [{role: "user", content: summaryPrompt}],
      options.temperature ?? this.config.temperature,
    );
  }

  async run(
    inputText: string,
    options: {temperature?: number} = {},
  ): Promise<string> {
    this.currentHistory = [];

    console.log(`\n🤖 ${this.name} 开始处理问题: ${inputText}`);

    for (let currentStep = 1; currentStep <= this.maxSteps; currentStep += 1) {
      console.log(`\n--- 第 ${currentStep} 步 ---`);

      const prompt = this.formatPrompt(inputText);
      const responseText = await this.llm.think(
        [{role: "user", content: prompt}],
        options.temperature ?? this.config.temperature,
      );

      if (!responseText) {
        console.log("❌ 错误：LLM未能返回有效响应。");
        break;
      }

      const {thought, action} = this.parseOutput(responseText);

      if (thought) {
        console.log(`🤔 思考: ${thought}`);
      }

      if (!action) {
        console.log("⚠️ 警告：未能解析出有效的Action，流程终止。");
        break;
      }

      if (action.startsWith("Finish")) {
        const finalAnswer = this.parseActionInput(action);
        console.log(`🎉 最终答案: ${finalAnswer}`);

        this.addMessage(new Message({role: "user", content: inputText}));
        this.addMessage(new Message({role: "assistant", content: finalAnswer}));

        return finalAnswer;
      }

      const {toolName, toolInput} = this.parseAction(action);
      if (!toolName || toolInput === null) {
        this.currentHistory.push("Observation: 无效的Action格式，请检查。");
        continue;
      }

      console.log(`🎬 行动: ${toolName}[${toolInput}]`);
      const observation = await this.executeTool(toolName, toolInput);
      console.log(`👀 观察: ${observation}`);

      this.currentHistory.push(`Action: ${action}`);
      this.currentHistory.push(`Observation: ${observation}`);
    }

    console.log("⏰ 已达到最大步数，开始总结已完成步骤。");

    let finalAnswer = "抱歉，我无法在限定步数内完成这个任务。";
    try {
      finalAnswer = await this.summarizeFromHistory(inputText, options);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      finalAnswer = [
        "抱歉，我无法在限定步数内完成这个任务。",
        "以下是当前阶段已获得的信息：",
        this.currentHistory.length
          ? this.currentHistory.join("\n")
          : "暂无可用步骤记录。",
        `（自动总结失败：${message}）`,
      ].join("\n\n");
    }

    this.addMessage(new Message({role: "user", content: inputText}));
    this.addMessage(new Message({role: "assistant", content: finalAnswer}));

    return finalAnswer;
  }
}

