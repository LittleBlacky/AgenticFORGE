import {ToolRegistry} from "./ToolRegistry";

export interface ParallelToolTask {
  tool_name: string;
  input_data?: string;
}

export interface ParallelToolResult {
  task_id: number;
  tool_name: string;
  input_data: string;
  result: string;
  status: "success" | "error";
}

export class AsyncToolExecutor {
  private readonly registry: ToolRegistry;
  private readonly maxWorkers: number;
  private closed = false;

  constructor(registry: ToolRegistry, maxWorkers = 4) {
    this.registry = registry;
    this.maxWorkers = Math.max(1, maxWorkers);
  }

  async executeToolAsync(toolName: string, inputData: string): Promise<string> {
    if (this.closed) {
      return "❌ 异步工具执行器已关闭";
    }

    try {
      return await this.registry.execute(toolName, {input: inputData});
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `❌ 工具 '${toolName}' 异步执行失败: ${message}`;
    }
  }

  async executeToolsParallel(
    tasks: ParallelToolTask[],
  ): Promise<ParallelToolResult[]> {
    if (this.closed) {
      return [];
    }

    console.log(`🚀 开始并行执行 ${tasks.length} 个工具任务`);

    const normalizedTasks = tasks
      .map((task, index) => ({
        task_id: index,
        tool_name: task.tool_name,
        input_data: task.input_data ?? "",
      }))
      .filter((task) => Boolean(task.tool_name));

    for (const [index, task] of normalizedTasks.entries()) {
      console.log(`📝 创建任务 ${index + 1}: ${task.tool_name}`);
    }

    const results: ParallelToolResult[] = [];
    let cursor = 0;

    const worker = async () => {
      while (cursor < normalizedTasks.length) {
        const current = normalizedTasks[cursor];
        cursor += 1;
        if (!current) {
          continue;
        }

        try {
          const result = await this.executeToolAsync(
            current.tool_name,
            current.input_data,
          );
          results.push({
            task_id: current.task_id,
            tool_name: current.tool_name,
            input_data: current.input_data,
            result,
            status: result.startsWith("❌") ? "error" : "success",
          });
          console.log(`✅ 任务 ${current.task_id + 1} 完成: ${current.tool_name}`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          results.push({
            task_id: current.task_id,
            tool_name: current.tool_name,
            input_data: current.input_data,
            result: message,
            status: "error",
          });
          console.log(
            `❌ 任务 ${current.task_id + 1} 失败: ${current.tool_name} - ${message}`,
          );
        }
      }
    };

    const workerCount = Math.min(this.maxWorkers, normalizedTasks.length || 1);
    await Promise.all(Array.from({length: workerCount}, () => worker()));

    results.sort((a, b) => a.task_id - b.task_id);

    const successCount = results.filter((result) => result.status === "success").length;
    console.log(`🎉 并行执行完成，成功: ${successCount}/${results.length}`);

    return results;
  }

  async executeToolsBatch(
    toolName: string,
    inputList: string[],
  ): Promise<ParallelToolResult[]> {
    const tasks: ParallelToolTask[] = inputList.map((input_data) => ({
      tool_name: toolName,
      input_data,
    }));

    return this.executeToolsParallel(tasks);
  }

  close(): void {
    this.closed = true;
    console.log("🔒 异步工具执行器已关闭");
  }
}

export async function runParallelTools(
  registry: ToolRegistry,
  tasks: ParallelToolTask[],
  maxWorkers = 4,
): Promise<ParallelToolResult[]> {
  const executor = new AsyncToolExecutor(registry, maxWorkers);
  try {
    return await executor.executeToolsParallel(tasks);
  } finally {
    executor.close();
  }
}

export async function runBatchTool(
  registry: ToolRegistry,
  toolName: string,
  inputList: string[],
  maxWorkers = 4,
): Promise<ParallelToolResult[]> {
  const executor = new AsyncToolExecutor(registry, maxWorkers);
  try {
    return await executor.executeToolsBatch(toolName, inputList);
  } finally {
    executor.close();
  }
}

export function runParallelToolsSync(
  registry: ToolRegistry,
  tasks: ParallelToolTask[],
  maxWorkers = 4,
): Promise<ParallelToolResult[]> {
  return runParallelTools(registry, tasks, maxWorkers);
}

export function runBatchToolSync(
  registry: ToolRegistry,
  toolName: string,
  inputList: string[],
  maxWorkers = 4,
): Promise<ParallelToolResult[]> {
  return runBatchTool(registry, toolName, inputList, maxWorkers);
}
