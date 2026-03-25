import type {LLMClient} from "@agenticforge/core";
import type {ToolRegistry} from "@agenticforge/tools";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

/** 节点的执行上下文，包含所有已完成节点的输出以及初始 input */
export type WorkflowContext = Record<string, string>;

/** 节点自定义执行函数签名 */
export type NodeExecutorFn = (
  ctx: WorkflowContext,
  llm: LLMClient,
  registry?: ToolRegistry,
) => Promise<string>;

// ---------------------------------------------------------------------------
// Node types
// ---------------------------------------------------------------------------

/** 所有节点的公共基础字段 */
export interface BaseNode {
  id: string;
  /** 依赖节点 id 列表（这些节点完成后本节点才会执行） */
  depends?: string[];
}

export interface ToolNode extends BaseNode {
  type: "tool";
  /** 工具名称（需在 ToolRegistry 中注册） */
  toolName: string;
  /** 输入模板，支持 {变量} 插值 */
  inputTemplate: string;
}

export interface LLMNode extends BaseNode {
  type: "llm";
  /** Prompt 模板，支持 {变量} 插值 */
  promptTemplate: string;
  /** 可选系统提示词 */
  systemPrompt?: string;
}

export interface FnNode extends BaseNode {
  type: "fn";
  executor: NodeExecutorFn;
}

export interface PassthroughNode extends BaseNode {
  type: "passthrough";
  /** 透传的 context key，缺省时透传初始 input */
  sourceKey?: string;
}

/**
 * Branch 节点 — 条件分支
 *
 * condition 返回分支名称（key of branches），引擎执行对应分支的子 DAG，
 * 分支最后一个成功节点的输出写入 ctx[node.id]。
 *
 * @example
 * ```ts
 * {
 *   id: "router",
 *   type: "branch",
 *   condition: (ctx) => ctx["score"] > "80" ? "high" : "low",
 *   branches: {
 *     high: [{ id: "premium", type: "llm", promptTemplate: "...", depends: [] }],
 *     low:  [{ id: "basic",   type: "llm", promptTemplate: "...", depends: [] }],
 *   },
 * }
 * ```
 */
export interface BranchNode extends BaseNode {
  type: "branch";
  /** 条件函数，返回要执行的分支名称。若返回值不在 branches 中，引擎将抛出错误。 */
  condition: (ctx: WorkflowContext) => string | Promise<string>;
  /** 分支名称 → 子节点列表（每条分支都是一个小型 DAG） */
  branches: Record<string, WorkflowNode[]>;
}

/**
 * Loop 节点 — 循环执行（do-while 语义）
 *
 * 每次迭代完整执行 body 子 DAG；迭代结束后调用 condition：
 * - 返回 true  → 继续下一次迭代
 * - 返回 false → 停止
 * - 省略 condition → 仅受 maxIterations 控制
 *
 * body 节点可通过 {loopNodeId} 插值访问上一次迭代的输出（首次为空字符串）。
 *
 * @example
 * ```ts
 * {
 *   id: "refine",
 *   type: "loop",
 *   maxIterations: 3,
 *   condition: (ctx, iter) => ctx["score"] < "90",
 *   body: [
 *     { id: "critique", type: "llm", promptTemplate: "批评：{refine}", depends: [] },
 *     { id: "improve",  type: "llm", promptTemplate: "改进：{critique}", depends: ["critique"] },
 *   ],
 * }
 * ```
 */
export interface LoopNode extends BaseNode {
  type: "loop";
  /** 每次迭代执行的子节点列表（DAG） */
  body: WorkflowNode[];
  /**
   * 迭代结束后调用的终止条件。
   * 返回 true 继续循环，返回 false 停止。
   */
  condition?: (ctx: WorkflowContext, iteration: number) => boolean | Promise<boolean>;
  /** 最大迭代次数，默认 10 */
  maxIterations?: number;
}

/**
 * 工作流节点定义，支持六种类型：
 * - `tool`        调用工具
 * - `llm`         调用 LLM
 * - `fn`          自定义异步函数
 * - `passthrough` 透传 context 变量
 * - `branch`      条件分支
 * - `loop`        循环执行
 */
export type WorkflowNode =
  | ToolNode
  | LLMNode
  | FnNode
  | PassthroughNode
  | BranchNode
  | LoopNode;

// ---------------------------------------------------------------------------
// Workflow definition
// ---------------------------------------------------------------------------

export interface WorkflowDefinition {
  /** 工作流名称 */
  name: string;
  /** 节点列表，顺序无关，引擎自动拓扑排序 */
  nodes: WorkflowNode[];
}

// ---------------------------------------------------------------------------
// Execution result
// ---------------------------------------------------------------------------

export type NodeStatus = "pending" | "running" | "done" | "failed";

export interface NodeResult {
  nodeId: string;
  status: NodeStatus;
  output: string;
  error?: string;
  durationMs: number;
  /** loop 节点：实际执行的迭代次数 */
  iterations?: number;
  /** branch 节点：实际执行的分支名 */
  branch?: string;
}

export interface WorkflowResult {
  /** 最终输出（拓扑序最后一个成功节点的 output） */
  output: string;
  /** 所有节点的执行结果 */
  nodeResults: NodeResult[];
  /** 完整 context 快照（包含每个节点的输出） */
  context: WorkflowContext;
}
