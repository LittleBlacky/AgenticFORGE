import { Agent, Message, createAgentMessage } from "@agenticforge/core";
import type { ToolRegistry } from "@agenticforge/tools";
import { WorkflowEngine } from "@agenticforge/workflow";
import type { WorkflowDefinition, WorkflowResult } from "@agenticforge/workflow";

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
 * WorkflowAgent — 支持四种执行模式的工作流 Agent
 *
 * 由 WorkflowEngine（来自 @agenticforge/workflow）驱动，支持：
 * - **Sequential**：通过 `depends` 形成线性执行链
 * - **Parallel**：同一波次内无依赖的节点自动并发执行（受 maxConcurrency 控制）
 * - **Branch**：`type: "branch"` 节点，condition 函数返回分支名，执行对应子 DAG
 * - **Loop**：`type: "loop"` 节点，反复执行 body 子 DAG 直到 condition 返回 false 或达到 maxIterations
 *
 * 节点类型：`tool` / `llm` / `fn` / `passthrough` / `branch` / `loop`
 *
 * @example Sequential + Parallel
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
 *       // analyze 和 translate 并发执行（同依赖 fetch，互不依赖）
 *       { id: "analyze",   type: "llm", promptTemplate: "分析：{fetch}",   depends: ["fetch"] },
 *       { id: "translate", type: "llm", promptTemplate: "翻译：{fetch}",   depends: ["fetch"] },
 *       { id: "report",    type: "llm", promptTemplate: "报告：{analyze}\n译文：{translate}", depends: ["analyze", "translate"] },
 *     ],
 *   },
 *   "AI行业趋势",
 * );
 * ```
 *
 * @example Branch
 * ```ts
 * nodes: [
 *   { id: "classify", type: "llm", promptTemplate: "分类 {input}，输出 simple 或 complex", depends: [] },
 *   {
 *     id: "router", type: "branch",
 *     condition: (ctx) => ctx["classify"].includes("complex") ? "complex" : "simple",
 *     branches: {
 *       simple:  [{ id: "quick",  type: "llm", promptTemplate: "简答：{input}", depends: [] }],
 *       complex: [{ id: "detail", type: "llm", promptTemplate: "详答：{input}", depends: [] }],
 *     },
 *     depends: ["classify"],
 *   },
 * ]
 * ```
 *
 * @example Loop
 * ```ts
 * nodes: [
 *   {
 *     id: "refine", type: "loop",
 *     maxIterations: 3,
 *     condition: (ctx, iter) => !ctx["refine"].includes("满意"),
 *     body: [
 *       { id: "critique", type: "llm", promptTemplate: "批评上一版本：{refine}", depends: [] },
 *       { id: "improve",  type: "llm", promptTemplate: "根据批评改进：{critique}", depends: ["critique"] },
 *     ],
 *   },
 * ]
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
  async runWorkflow(definition: WorkflowDefinition, input: string): Promise<WorkflowResult> {
    const result = await this.engine.execute(definition, input);
    this.addMessage(createAgentMessage("user", input));
    this.addMessage(createAgentMessage("assistant", result.output));
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
