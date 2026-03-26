import type { LLMClient } from "@agenticforge/core";
import type { ToolRegistry } from "@agenticforge/tools";
import type {
  WorkflowDefinition,
  WorkflowNode,
  WorkflowContext,
  WorkflowResult,
  NodeResult,
  BranchNode,
  LoopNode,
} from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function interpolate(template: string, ctx: WorkflowContext): string {
  return template.replace(/\{([\w-]+)\}/g, (_m, key: string) => ctx[key] ?? `{${key}}`);
}

// ---------------------------------------------------------------------------
// Topological sort — Kahn's algorithm
// ---------------------------------------------------------------------------

/**
 * 对节点列表做拓扑排序。
 * branch/loop 节点的子 DAG 在递归执行时再单独排序，不参与顶层排序。
 */
function topoSort(nodes: WorkflowNode[]): WorkflowNode[] {
  const idToNode = new Map<string, WorkflowNode>(nodes.map((n) => [n.id, n]));
  const inDegree = new Map<string, number>();
  const children = new Map<string, string[]>();

  for (const node of nodes) {
    inDegree.set(node.id, node.depends?.length ?? 0);
    children.set(node.id, []);
  }
  for (const node of nodes) {
    for (const dep of node.depends ?? []) {
      if (!idToNode.has(dep)) {
        throw new Error(`节点 "${node.id}" 依赖了未定义的节点 "${dep}"`);
      }
      children.get(dep)!.push(node.id);
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const sorted: WorkflowNode[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    sorted.push(idToNode.get(id)!);
    for (const child of children.get(id) ?? []) {
      const newDeg = (inDegree.get(child) ?? 1) - 1;
      inDegree.set(child, newDeg);
      if (newDeg === 0) queue.push(child);
    }
  }

  if (sorted.length !== nodes.length) {
    const cycle = nodes.map((n) => n.id).filter((id) => !sorted.find((s) => s.id === id));
    throw new Error(`工作流存在循环依赖，涉及节点: ${cycle.join(", ")}`);
  }

  return sorted;
}

// ---------------------------------------------------------------------------
// Leaf node executor (tool / llm / fn / passthrough)
// ---------------------------------------------------------------------------

type LeafNode = Exclude<WorkflowNode, BranchNode | LoopNode>;

async function executeLeafNode(
  node: LeafNode,
  ctx: WorkflowContext,
  llm: LLMClient,
  registry: ToolRegistry | undefined,
): Promise<string> {
  switch (node.type) {
    case "tool": {
      if (!registry) {
        throw new Error(`节点 "${node.id}": 类型为 tool 但未提供 ToolRegistry`);
      }
      const input = interpolate(node.inputTemplate, ctx);
      return registry.execute(node.toolName, { input });
    }
    case "llm": {
      const prompt = interpolate(node.promptTemplate, ctx);
      const messages: Array<{ role: "system" | "user"; content: string }> = [];
      if (node.systemPrompt) {
        messages.push({ role: "system", content: node.systemPrompt });
      }
      messages.push({ role: "user", content: prompt });
      return llm.think(messages);
    }
    case "fn": {
      return node.executor(ctx, llm, registry);
    }
    case "passthrough": {
      const key = node.sourceKey ?? "input";
      return ctx[key] ?? "";
    }
  }
}

// ---------------------------------------------------------------------------
// WorkflowEngine
// ---------------------------------------------------------------------------

export interface WorkflowEngineOptions {
  llm: LLMClient;
  registry?: ToolRegistry;
  verbose?: boolean;
  /**
   * 单波次最大并发节点数（Parallel 模式）。
   * 默认不限制（同一波次内所有就绪节点并发执行）。
   */
  maxConcurrency?: number;
}

export class WorkflowEngine {
  private readonly llm: LLMClient;
  private readonly registry?: ToolRegistry;
  private readonly verbose: boolean;
  private readonly maxConcurrency: number;

  constructor(opts: WorkflowEngineOptions) {
    this.llm = opts.llm;
    this.registry = opts.registry;
    this.verbose = opts.verbose ?? false;
    this.maxConcurrency = opts.maxConcurrency ?? Number.POSITIVE_INFINITY;
  }

  // -------------------------------------------------------------------------
  // Public entry
  // -------------------------------------------------------------------------

  async execute(definition: WorkflowDefinition, input: string): Promise<WorkflowResult> {
    const ctx: WorkflowContext = { input };
    const nodeResults: NodeResult[] = [];
    await this.executeDAG(definition.nodes, ctx, nodeResults);

    const lastDone = [...nodeResults].reverse().find((r) => r.status === "done");
    const output = lastDone?.output ?? "";
    return { output, nodeResults, context: { ...ctx } };
  }

  // -------------------------------------------------------------------------
  // DAG executor — recursive, used for top-level + branch/loop sub-DAGs
  // -------------------------------------------------------------------------

  private async executeDAG(
    nodes: WorkflowNode[],
    ctx: WorkflowContext,
    nodeResults: NodeResult[],
  ): Promise<void> {
    const sorted = topoSort(nodes);
    const done = new Set<string>();
    let remaining = [...sorted];

    while (remaining.length > 0) {
      // Collect nodes whose all deps are satisfied
      const wave = remaining.filter((n) => (n.depends ?? []).every((dep) => done.has(dep)));

      if (wave.length === 0) {
        throw new Error("[WorkflowEngine] 调度异常：存在无法就绪的节点，请检查依赖配置");
      }

      // Apply concurrency cap
      const batch = Number.isFinite(this.maxConcurrency)
        ? wave.slice(0, this.maxConcurrency)
        : wave;

      if (this.verbose) {
        console.log(`[WorkflowEngine] 执行波次: [${batch.map((n) => n.id).join(", ")}]`);
      }

      const settled = await Promise.allSettled(
        batch.map((node) => this.executeNode(node, ctx, nodeResults)),
      );

      const batchIds = new Set(batch.map((n) => n.id));

      for (const result of settled) {
        if (result.status !== "fulfilled") continue;
        const r = result.value;
        nodeResults.push(r);
        done.add(r.nodeId);
        if (r.status === "done") {
          ctx[r.nodeId] = r.output;
        }
      }

      remaining = remaining.filter((n) => !batchIds.has(n.id));
    }
  }

  // -------------------------------------------------------------------------
  // Single node dispatcher
  // -------------------------------------------------------------------------

  private async executeNode(
    node: WorkflowNode,
    ctx: WorkflowContext,
    nodeResults: NodeResult[],
  ): Promise<NodeResult> {
    const start = Date.now();
    try {
      if (node.type === "branch") {
        return await this.executeBranch(node, ctx, nodeResults, start);
      }
      if (node.type === "loop") {
        return await this.executeLoop(node, ctx, nodeResults, start);
      }
      const output = await executeLeafNode(node, ctx, this.llm, this.registry);
      return { nodeId: node.id, status: "done", output, durationMs: Date.now() - start };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      if (this.verbose) {
        console.warn(`[WorkflowEngine] 节点 "${node.id}" 失败: ${error}`);
      }
      return {
        nodeId: node.id,
        status: "failed",
        output: "",
        error,
        durationMs: Date.now() - start,
      };
    }
  }

  // -------------------------------------------------------------------------
  // Branch executor
  // -------------------------------------------------------------------------

  private async executeBranch(
    node: BranchNode,
    ctx: WorkflowContext,
    nodeResults: NodeResult[],
    start: number,
  ): Promise<NodeResult> {
    const branchName = await node.condition(ctx);

    if (!(branchName in node.branches)) {
      throw new Error(
        `[WorkflowEngine] branch 节点 "${node.id}" 返回了未定义的分支 "${branchName}"，` +
          `可用分支: ${Object.keys(node.branches).join(", ")}`,
      );
    }

    if (this.verbose) {
      console.log(`[WorkflowEngine] branch "${node.id}" → 执行分支 "${branchName}"`);
    }

    const subResults: NodeResult[] = [];
    await this.executeDAG(node.branches[branchName], ctx, subResults);
    nodeResults.push(...subResults);

    const lastDone = [...subResults].reverse().find((r) => r.status === "done");
    const output = lastDone?.output ?? "";

    return {
      nodeId: node.id,
      status: "done",
      output,
      durationMs: Date.now() - start,
      branch: branchName,
    };
  }

  // -------------------------------------------------------------------------
  // Loop executor
  // -------------------------------------------------------------------------

  private async executeLoop(
    node: LoopNode,
    ctx: WorkflowContext,
    nodeResults: NodeResult[],
    start: number,
  ): Promise<NodeResult> {
    const maxIter = node.maxIterations ?? 10;
    let iteration = 0;
    let lastOutput = "";

    // Initialise loop output key so body nodes can reference {node.id} from the very first iteration
    ctx[node.id] = "";

    while (iteration < maxIter) {
      iteration++;

      if (this.verbose) {
        console.log(`[WorkflowEngine] loop "${node.id}" — 第 ${iteration}/${maxIter} 次迭代`);
      }

      const subResults: NodeResult[] = [];
      await this.executeDAG(node.body, ctx, subResults);
      nodeResults.push(...subResults);

      const lastDone = [...subResults].reverse().find((r) => r.status === "done");
      lastOutput = lastDone?.output ?? lastOutput;

      // Update ctx so the next iteration body and the condition can reference it
      ctx[node.id] = lastOutput;

      // Evaluate continuation condition (do-while: checked after each execution)
      if (node.condition) {
        const shouldContinue = await node.condition(ctx, iteration);
        if (!shouldContinue) {
          if (this.verbose) {
            console.log(`[WorkflowEngine] loop "${node.id}" — condition 返回 false，停止循环`);
          }
          break;
        }
      }
    }

    if (this.verbose && iteration >= maxIter && node.condition) {
      console.log(`[WorkflowEngine] loop "${node.id}" — 达到最大迭代次数 ${maxIter}，停止`);
    }

    return {
      nodeId: node.id,
      status: "done",
      output: lastOutput,
      durationMs: Date.now() - start,
      iterations: iteration,
    };
  }
}
