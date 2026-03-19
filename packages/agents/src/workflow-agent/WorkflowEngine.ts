import type {LLMClient} from "@agenticforge/core";
import type {ToolRegistry} from "@agenticforge/tools";
import type {
  WorkflowDefinition,
  WorkflowNode,
  WorkflowContext,
  WorkflowResult,
  NodeResult,
} from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function interpolate(template: string, ctx: WorkflowContext): string {
  return template.replace(/\{(\w+)\}/g, (_m, key: string) => ctx[key] ?? `{${key}}`);
}

// ---------------------------------------------------------------------------
// Topological sort — Kahn's algorithm
// ---------------------------------------------------------------------------

function topoSort(nodes: WorkflowNode[]): WorkflowNode[] {
  const idToNode = new Map<string, WorkflowNode>(nodes.map((n) => [n.id, n]));
  const inDegree = new Map<string, number>();
  // dep → list of nodes that depend on dep
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
    const cycle = nodes
      .map((n) => n.id)
      .filter((id) => !sorted.find((s) => s.id === id));
    throw new Error(`工作流存在循环依赖，涉及节点: ${cycle.join(", ")}`);
  }

  return sorted;
}

// ---------------------------------------------------------------------------
// Single-node executor
// ---------------------------------------------------------------------------

async function executeNode(
  node: WorkflowNode,
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
      return registry.execute(node.toolName, {input});
    }
    case "llm": {
      const prompt = interpolate(node.promptTemplate, ctx);
      const messages: Array<{role: "system" | "user"; content: string}> = [];
      if (node.systemPrompt) {
        messages.push({role: "system", content: node.systemPrompt});
      }
      messages.push({role: "user", content: prompt});
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
   * 单波次最大并发节点数。
   * 默认不限制（同一波次内所有就绪节点并发执行）。
   */
  maxConcurrency?: number;
}

/**
 * WorkflowEngine 按 DAG 拓扑顺序执行工作流节点。
 *
 * 执行策略：
 * 1. 拓扑排序所有节点，检测循环依赖
 * 2. 每轮选出所有依赖已完成的节点（同一波次 wave）
 * 3. 波次内节点并发执行（受 maxConcurrency 限制）
 * 4. 每个节点的输出以 nodeId 为 key 写入 context，供后续节点插值
 */
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

  async execute(
    definition: WorkflowDefinition,
    input: string,
  ): Promise<WorkflowResult> {
    const sorted = topoSort(definition.nodes);
    const ctx: WorkflowContext = {input};
    const nodeResults: NodeResult[] = [];
    const done = new Set<string>();
    let remaining = [...sorted];

    while (remaining.length > 0) {
      // Collect nodes whose all deps are done
      const wave = remaining.filter((n) =>
        (n.depends ?? []).every((dep) => done.has(dep)),
      );

      if (wave.length === 0) {
        // Guard: should not happen after valid topo sort
        throw new Error("[WorkflowEngine] 调度异常：存在无法就绪的节点，请检查依赖配置");
      }

      // Apply concurrency cap
      const batch = Number.isFinite(this.maxConcurrency)
        ? wave.slice(0, this.maxConcurrency)
        : wave;

      if (this.verbose) {
        console.log(
          `[WorkflowEngine] 执行波次: [${batch.map((n) => n.id).join(", ")}]`,
        );
      }

      const settled = await Promise.allSettled(
        batch.map(async (node): Promise<NodeResult> => {
          const start = Date.now();
          try {
            const output = await executeNode(node, ctx, this.llm, this.registry);
            return {nodeId: node.id, status: "done", output, durationMs: Date.now() - start};
          } catch (e) {
            const error = e instanceof Error ? e.message : String(e);
            if (this.verbose) {
              console.warn(`[WorkflowEngine] 节点 "${node.id}" 失败: ${error}`);
            }
            return {nodeId: node.id, status: "failed", output: "", error, durationMs: Date.now() - start};
          }
        }),
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

    // Final output: last node in topo order that succeeded
    const lastDone = [...nodeResults].reverse().find((r) => r.status === "done");
    const output = lastDone?.output ?? "";

    return {output, nodeResults, context: {...ctx}};
  }
}
