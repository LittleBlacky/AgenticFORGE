import {Agent, Message} from "@agenticforge/core";
import {ToolRegistry} from "@agenticforge/tools";
import {WorkflowEngine} from "./WorkflowEngine";
import type {WorkflowDefinition, WorkflowResult} from "./types";

export interface WorkflowAgentOptions {
  name: string;
  llm: Agent["llm"];
  systemPrompt?: string;
  config?: Agent["config"];
  /** 工具注册表，供 type: "tool" 节点使用 */
  registry?: ToolRegistry;
  /** 是否打印执行日志，默认 false */
  verbose?: boolean;
  /** 单波次最大并发节点数，默认不限制 */
  maxConcurrency?: number;
}

/**
 * WorkflowAgent — DAG 工作流 Agent
 *
 * 将一组有依赖关系的节点组织成有向无环图（DAG），由 WorkflowEngine 驱动执行：
 * - 自动拓扑排序，检测循环依赖
 * - 同一波次（wave）内无依赖关系的节点并发执行
 * - 每个节点的输出以 nodeId 为 key 写入 context，供后续节点通过 {nodeId} 插值引用
 * - 支持四种节点类型：tool / llm / fn / passthrough
 *
 * @example
 * ```ts
 * const agent = new WorkflowAgent({
 *   name: "report-workflow",
 *   llm: new LLMClient({ provider: "openai", model: "gpt-4o" }),
 *   verbose: true,
 * });
 *
 * const result = await agent.runWorkflow(
 *   {
 *     name: "data-report",
 *     nodes: [
 *       { id: "fetch",   type: "tool", toolName: "search", inputTemplate: "{input}", depends: [] },
 *       { id: "analyze", type: "llm",  promptTemplate: "分析：\n{fetch}",           depends: ["fetch"] },
 *       { id: "report",  type: "llm",  promptTemplate: "写报告：\n{analyze}",       depends: ["analyze"] },
 *     ],
 *   },
 *   "AI行业趋势",
 * );
 * console.log(result.output);
 * ```
 */
export class WorkflowAgent extends Agent {
  private readonly engine: WorkflowEngine;
  private currentWorkflow?: WorkflowDefinition;

  constructor(opts: WorkflowAgentOptions) {
    super({
      name: opts.name,
      llm: opts.llm,
      systemPrompt: opts.systemPrompt,
      config: opts.config,
    });

    this.engine = new WorkflowEngine({
      llm: opts.llm,
      registry: opts.registry,
      verbose: opts.verbose,
      maxConcurrency: opts.maxConcurrency,
    });
  }

  /**
   * 执行一个 WorkflowDefinition，返回完整执行结果。
   *
   * @param definition  工作流定义（节点列表）
   * @param input       初始输入，可在节点模板中用 {input} 引用
   */
  async runWorkflow(
    definition: WorkflowDefinition,
    input: string,
  ): Promise<WorkflowResult> {
    const result = await this.engine.execute(definition, input);
    this.addMessage(new Message({role: "user",      content: input}));
    this.addMessage(new Message({role: "assistant", content: result.output}));
    return result;
  }

  /**
   * 预设工作流，之后可直接调用 run(input)。
   */
  setWorkflow(definition: WorkflowDefinition): this {
    this.currentWorkflow = definition;
    return this;
  }

  /**
   * 实现 Agent 基类 run 接口。
   * 需先调用 setWorkflow()，或直接使用 runWorkflow()。
   */
  async run(inputText: string): Promise<string> {
    if (!this.currentWorkflow) {
      throw new Error(
        "[WorkflowAgent] 请先调用 setWorkflow(definition) 设置工作流，" +
        "或直接使用 runWorkflow(definition, input)",
      );
    }
    const result = await this.runWorkflow(this.currentWorkflow, inputText);
    return result.output;
  }
}
