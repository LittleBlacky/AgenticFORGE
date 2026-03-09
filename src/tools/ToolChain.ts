import {ToolRegistry} from "./ToolRegistry";

export interface ChainStep {
  toolName: string;
  inputTemplate: string;
  outputKey: string;
}

export interface ChainInfo {
  name: string;
  description: string;
  steps: number;
  stepDetails: ChainStep[];
}

function renderTemplate(
  template: string,
  context: Record<string, unknown>,
): string {
  return template.replace(/\{([^{}]+)\}/g, (_match, key: string) => {
    const value = context[key];
    if (value === undefined) {
      throw new Error(`模板变量 '${key}' 未定义`);
    }
    return String(value);
  });
}

export class ToolChain {
  public readonly name: string;
  public readonly description: string;
  private readonly steps: ChainStep[] = [];

  constructor(name: string, description: string) {
    this.name = name;
    this.description = description;
  }

  addStep(toolName: string, inputTemplate: string, outputKey?: string): void {
    const step: ChainStep = {
      toolName,
      inputTemplate,
      outputKey: outputKey ?? `step_${this.steps.length}_result`,
    };

    this.steps.push(step);
    console.log(`✅ 工具链 '${this.name}' 添加步骤: ${toolName}`);
  }

  getSteps(): ChainStep[] {
    return [...this.steps];
  }

  async execute(
    registry: ToolRegistry,
    inputData: string,
    context: Record<string, unknown> = {},
  ): Promise<string> {
    if (this.steps.length === 0) {
      return "❌ 工具链为空，无法执行";
    }

    console.log(`🚀 开始执行工具链: ${this.name}`);

    const runtimeContext: Record<string, unknown> = {
      ...context,
      input: inputData,
    };

    let finalResult = inputData;

    for (const [index, step] of this.steps.entries()) {
      console.log(`📝 执行步骤 ${index + 1}/${this.steps.length}: ${step.toolName}`);

      let actualInput = "";
      try {
        actualInput = renderTemplate(step.inputTemplate, runtimeContext);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `❌ 模板变量替换失败: ${message}`;
      }

      try {
        const result = await registry.execute(step.toolName, {input: actualInput});
        runtimeContext[step.outputKey] = result;
        finalResult = result;
        console.log(`✅ 步骤 ${index + 1} 完成`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `❌ 工具 '${step.toolName}' 执行失败: ${message}`;
      }
    }

    console.log(`🎉 工具链 '${this.name}' 执行完成`);
    return finalResult;
  }
}

export class ToolChainManager {
  private readonly registry: ToolRegistry;
  private readonly chains: Map<string, ToolChain> = new Map();

  constructor(registry: ToolRegistry) {
    this.registry = registry;
  }

  registerChain(chain: ToolChain): void {
    this.chains.set(chain.name, chain);
    console.log(`✅ 工具链 '${chain.name}' 已注册`);
  }

  async executeChain(
    chainName: string,
    inputData: string,
    context: Record<string, unknown> = {},
  ): Promise<string> {
    const chain = this.chains.get(chainName);
    if (!chain) {
      return `❌ 工具链 '${chainName}' 不存在`;
    }

    return chain.execute(this.registry, inputData, context);
  }

  listChains(): string[] {
    return Array.from(this.chains.keys());
  }

  getChainInfo(chainName: string): ChainInfo | null {
    const chain = this.chains.get(chainName);
    if (!chain) {
      return null;
    }

    const steps = chain.getSteps();
    return {
      name: chain.name,
      description: chain.description,
      steps: steps.length,
      stepDetails: steps,
    };
  }
}

export function createResearchChain(): ToolChain {
  const chain = new ToolChain(
    "research_and_calculate",
    "搜索信息并进行相关计算",
  );

  chain.addStep("search", "{input}", "search_result");
  chain.addStep("my_calculator", "2 + 2", "calc_result");

  return chain;
}

export function createSimpleChain(): ToolChain {
  const chain = new ToolChain("simple_demo", "简单的工具链演示");
  chain.addStep("my_calculator", "{input}", "result");
  return chain;
}
