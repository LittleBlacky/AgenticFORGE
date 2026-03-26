import type { AgentHook, AgentHookContext, AgentHookEvent } from "./types";

export interface HookMetricsSnapshot {
  totals: {
    allEvents: number;
    runStarted: number;
    runSucceeded: number;
    runFailed: number;
    llmCalls: number;
    toolCalls: number;
  };
  eventCounts: Record<AgentHookEvent, number>;
  agentCounts: Record<string, number>;
  avgRunLatencyMs: number;
  avgLlmLatencyMs: number;
  avgToolLatencyMs: number;
}

export class MetricsHook {
  private readonly runStart = new Map<string, number>();
  private readonly llmStart = new Map<string, number>();
  private readonly toolStart = new Map<string, number>();

  private readonly eventCounts: Record<AgentHookEvent, number> = {
    beforeRun: 0,
    afterRun: 0,
    onError: 0,
    beforeLLMCall: 0,
    afterLLMCall: 0,
    beforeToolCall: 0,
    afterToolCall: 0,
  };

  private readonly agentCounts = new Map<string, number>();

  private runLatencySum = 0;
  private runLatencyCount = 0;

  private llmLatencySum = 0;
  private llmLatencyCount = 0;

  private toolLatencySum = 0;
  private toolLatencyCount = 0;

  readonly hook: AgentHook = {
    name: "metrics-hook",
    priority: 0,
    strict: false,
    handle: async (context) => {
      this.capture(context);
    },
  };

  private capture(context: AgentHookContext): void {
    this.eventCounts[context.event] += 1;
    this.agentCounts.set(context.agentName, (this.agentCounts.get(context.agentName) ?? 0) + 1);

    const runKey = `${context.traceId}`;
    const llmKey = `${context.traceId}:llm`;
    const toolKey = `${context.traceId}:${context.toolName ?? "unknown"}`;

    const now = Date.now();

    if (context.event === "beforeRun") this.runStart.set(runKey, now);
    if (context.event === "beforeLLMCall") this.llmStart.set(llmKey, now);
    if (context.event === "beforeToolCall") this.toolStart.set(toolKey, now);

    if (context.event === "afterRun") {
      const start = this.runStart.get(runKey);
      if (start !== undefined) {
        this.runLatencySum += now - start;
        this.runLatencyCount += 1;
        this.runStart.delete(runKey);
      }
    }

    if (context.event === "afterLLMCall") {
      const start = this.llmStart.get(llmKey);
      if (start !== undefined) {
        this.llmLatencySum += now - start;
        this.llmLatencyCount += 1;
        this.llmStart.delete(llmKey);
      }
    }

    if (context.event === "afterToolCall") {
      const start = this.toolStart.get(toolKey);
      if (start !== undefined) {
        this.toolLatencySum += now - start;
        this.toolLatencyCount += 1;
        this.toolStart.delete(toolKey);
      }
    }
  }

  getSnapshot(): HookMetricsSnapshot {
    const agentCounts: Record<string, number> = {};
    for (const [name, count] of this.agentCounts.entries()) {
      agentCounts[name] = count;
    }

    return {
      totals: {
        allEvents: Object.values(this.eventCounts).reduce((acc, n) => acc + n, 0),
        runStarted: this.eventCounts.beforeRun,
        runSucceeded: this.eventCounts.afterRun,
        runFailed: this.eventCounts.onError,
        llmCalls: this.eventCounts.beforeLLMCall,
        toolCalls: this.eventCounts.beforeToolCall,
      },
      eventCounts: { ...this.eventCounts },
      agentCounts,
      avgRunLatencyMs: this.runLatencyCount === 0 ? 0 : this.runLatencySum / this.runLatencyCount,
      avgLlmLatencyMs: this.llmLatencyCount === 0 ? 0 : this.llmLatencySum / this.llmLatencyCount,
      avgToolLatencyMs:
        this.toolLatencyCount === 0 ? 0 : this.toolLatencySum / this.toolLatencyCount,
    };
  }
}
