import type {LLMClient} from "@agenticforge/core";
import type {ToolRegistry} from "@agenticforge/tools";

// ---------------------------------------------------------------------------
// Node types
// ---------------------------------------------------------------------------

/** 节点的执行上下文，包含所有已完成节点的输出以及初始 input */
export type WorkflowContext = Record<string, string>;

/** 节点自定义执行函数签名 */
export type NodeExecutorFn = (
  ctx: WorkflowContext,
  llm: LLMClient,
  registry?: ToolRegistry,
) => Promise<string>;

/**
 * 工作流节点定义，支持四种模式：
 *
 * - `tool`        调用 ToolRegistry 中已注册的工具，inputTemplate 支持 {变量} 插值
 * - `llm`         直接调用 LLM，promptTemplate 支持 {变量} 插值
 * - `fn`          自定义异步函数，可访问完整 context
 * - `passthrough` 透传某个 context 变量，不做任何处理
 */
export type WorkflowNode =
  | {
      id: string;
      type: "tool";
      /** 工具名称（需在 ToolRegistry 中注册） */
      toolName: string;
      /** 输入模板，支持 {变量} 插值 */
      inputTemplate: string;
      /** 依赖节点 id 列表（这些节点完成后本节点才会执行） */
      depends?: string[];
    }
  | {
      id: string;
      type: "llm";
      /** Prompt 模板，支持 {变量} 插值 */
      promptTemplate: string;
      /** 可选系统提示词 */
      systemPrompt?: string;
      /** 依赖节点 id 列表 */
      depends?: string[];
    }
  | {
      id: string;
      type: "fn";
      /** 自定义执行函数 */
      executor: NodeExecutorFn;
      /** 依赖节点 id 列表 */
      depends?: string[];
    }
  | {
      id: string;
      type: "passthrough";
      /** 透传的 context key，缺省时透传初始 input */
      sourceKey?: string;
      /** 依赖节点 id 列表 */
      depends?: string[];
    };

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
}

export interface WorkflowResult {
  /** 最终输出（拓扑序最后一个成功节点的 output） */
  output: string;
  /** 所有节点的执行结果 */
  nodeResults: NodeResult[];
  /** 完整 context 快照（包含每个节点的输出） */
  context: WorkflowContext;
}
