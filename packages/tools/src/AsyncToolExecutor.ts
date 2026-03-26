import type { ToolRegistry } from "./ToolRegistry";

export interface ToolCallRequest {
  id: string;
  toolName: string;
  parameters: Record<string, unknown>;
}

export interface ToolCallResult {
  id: string;
  toolName: string;
  output: string;
  error?: string;
  durationMs: number;
}

/**
 * Executes multiple tool calls concurrently and collects results.
 */
export class AsyncToolExecutor {
  private readonly registry: ToolRegistry;
  private readonly concurrency: number;

  constructor(registry: ToolRegistry, concurrency = 4) {
    this.registry = registry;
    this.concurrency = Math.max(1, concurrency);
  }

  /**
   * Execute a batch of tool calls with bounded concurrency.
   */
  async executeBatch(requests: ToolCallRequest[]): Promise<ToolCallResult[]> {
    const results: ToolCallResult[] = [];
    let idx = 0;

    const worker = async (): Promise<void> => {
      while (idx < requests.length) {
        const req = requests[idx++]!;
        results.push(await this.executeSingle(req));
      }
    };

    const workers = Array.from({ length: Math.min(this.concurrency, requests.length) }, worker);
    await Promise.all(workers);
    return results;
  }

  /**
   * Execute a single tool call.
   */
  async executeSingle(request: ToolCallRequest): Promise<ToolCallResult> {
    const start = Date.now();
    try {
      const output = await this.registry.execute(request.toolName, request.parameters);
      return {
        id: request.id,
        toolName: request.toolName,
        output,
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        id: request.id,
        toolName: request.toolName,
        output: "",
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - start,
      };
    }
  }
}
