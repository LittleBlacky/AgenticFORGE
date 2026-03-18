# AsyncToolExecutor 详细解析文档

## 一、背景与设计目标

在 Tool 体系中，`ToolRegistry.execute(...)` 本身是“单次调用单次返回”的能力。随着任务复杂度提升，会出现两类典型需求：

1. **并行调用多个工具任务**（例如同时计算多条表达式）；
2. **批量调用同一工具**（例如同一个工具处理一组输入）。

`AsyncToolExecutor` 的目标就是把这两类需求抽象成可复用的执行器，并保证：

- 有并发上限控制（`maxWorkers`）；
- 失败可恢复（单任务失败不拖垮整体）；
- 输出结构统一（便于日志、统计、上层 Agent 继续消费）。

文件位置：`src/tools/AsyncToolExecutor.ts`

---

## 二、核心类型设计

### 1) `ParallelToolTask`

```ts
interface ParallelToolTask {
  tool_name: string;
  input_data?: string;
}
```

用途：定义“待执行任务”输入格式。

- `tool_name`：工具名（必须）
- `input_data`：工具输入（可选，缺省会按空字符串处理）

### 2) `ParallelToolResult`

```ts
interface ParallelToolResult {
  task_id: number;
  tool_name: string;
  input_data: string;
  result: string;
  status: "success" | "error";
}
```

用途：定义“执行结果”统一格式。

- `task_id`：原始任务顺序索引（用于恢复顺序）
- `result`：工具返回文本或错误文本
- `status`：成功/失败状态

---

## 三、类结构总览

`AsyncToolExecutor` 内部状态：

- `registry: ToolRegistry`：工具执行入口
- `maxWorkers: number`：最大并发 worker 数（最小 1）
- `closed: boolean`：关闭标记，防止关闭后继续执行

构造函数：

```ts
constructor(registry: ToolRegistry, maxWorkers = 4)
```

关键处理：`this.maxWorkers = Math.max(1, maxWorkers)`，避免非法并发配置。

---

## 四、方法逐段解析

## 4.1 `executeToolAsync(toolName, inputData)`

职责：异步执行单个工具。

流程：

1. 若 `closed`，直接返回“执行器已关闭”错误文本；
2. 调用 `registry.execute(toolName, {input: inputData})`；
3. 捕获异常并转成统一错误文本返回。

设计要点：

- 这里不抛错，而是“文本化错误”，便于批量执行时聚合结果。
- 与项目现有 Tool 风格兼容：统一传 `{input: ...}`。

---

## 4.2 `executeToolsParallel(tasks)`

职责：受控并发执行多个任务。

这是本模块核心逻辑，分 6 步：

### 步骤 1：关闭态短路

如果执行器已关闭，直接返回空数组。

### 步骤 2：任务规范化

对输入任务做标准化：

- 挂上 `task_id`（保留原始顺序）；
- `input_data` 缺省转空字符串；
- 过滤掉无 `tool_name` 的无效任务。

### 步骤 3：并发调度模型

这一段的实现关键是：**不用为每个任务都 `Promise.all(tasks.map(...))` 全量放开并发**，而是用“共享游标 + 固定数量 worker”来做受控并发。

#### 3.1 共享游标是什么

在 `executeToolsParallel` 里定义了一个可变变量：

- `let cursor = 0`

它表示“下一个尚未被处理的任务索引”。任何 worker 想拿任务，都先读取 `normalizedTasks[cursor]`，然后把 `cursor += 1`。

这样做的效果是：

- 每个任务只会被某一个 worker 领取一次；
- 不需要提前把每个任务都封装成独立 promise 阵列；
- 任务分配是“按完成速度动态抢占”的，快 worker 会多拿任务，整体吞吐更高。

#### 3.2 单个 worker 的循环逻辑

每个 worker 本质是一个 `async` 函数，核心结构是：

- `while (cursor < normalizedTasks.length)` 持续抢任务
- 取到任务后执行 `executeToolAsync(...)`
- 把结果写入 `results`
- 再回到循环继续抢下一条

为什么要 `while`：

- 避免“一 worker 只做一条”的低效模式；
- 让 worker 在自己空闲时继续消费队列，直到任务耗尽。

#### 3.3 worker 数量如何计算

```ts
const workerCount = Math.min(this.maxWorkers, normalizedTasks.length || 1);
```

这个表达式有两个目的：

1. **上限保护**：worker 数不超过 `maxWorkers`；
2. **避免浪费**：worker 数不超过任务数（任务只有 2 条就没必要起 10 个 worker）。

`|| 1` 的作用是防守式写法，确保空数组场景下也不会创建长度为 0 导致的边界混乱。

#### 3.4 等待全部 worker 完成

```ts
await Promise.all(Array.from({length: workerCount}, () => worker()));
```

含义是：

- 启动 `workerCount` 个并发 worker；
- 只有当所有 worker 的 `while` 循环都自然退出（任务被领完）后才继续往下走。

因此这里等待的是“worker 完成”，不是“单个任务完成”。

#### 3.5 这个模型的工程收益

- **并发可控**：不会因为任务数很大而瞬间创建海量并发。
- **吞吐稳定**：快任务先结束，worker 立即领取新任务，不会出现静态分片带来的尾部拖慢。
- **实现简单**：不需要额外队列库，纯 TS/Promise 即可实现。

> 简化理解：
> `maxWorkers = 4` 且任务 10 条时，相当于“4 个工人共享一个任务篮子，谁先干完谁继续拿下一件”，直到篮子为空。

#### 3.6 时间线示例（5 个任务，2 个 worker）

假设：

- `normalizedTasks = [T0, T1, T2, T3, T4]`
- `workerCount = 2`
- 初始 `cursor = 0`

执行过程可以抽象为：

- **时刻 t0**
  - Worker-A 抢到 `T0`（`cursor: 0 -> 1`）
  - Worker-B 抢到 `T1`（`cursor: 1 -> 2`）

- **时刻 t1（A 更快）**
  - Worker-A 完成 `T0`，继续抢到 `T2`（`cursor: 2 -> 3`）
  - Worker-B 仍在执行 `T1`

- **时刻 t2（B 完成）**
  - Worker-B 完成 `T1`，抢到 `T3`（`cursor: 3 -> 4`）
  - Worker-A 仍在执行 `T2`

- **时刻 t3（A 再次完成）**
  - Worker-A 完成 `T2`，抢到 `T4`（`cursor: 4 -> 5`）

- **时刻 t4**
  - Worker-B 完成 `T3`，尝试继续抢任务时发现 `cursor >= 5`，退出循环

- **时刻 t5**
  - Worker-A 完成 `T4`，同样发现任务耗尽并退出
  - `Promise.all(workers)` 返回，进入后续结果排序阶段

这个例子说明两点：

1. **谁快谁多干**：任务分配是动态的，不会因为静态分片导致慢 worker 成为瓶颈；
2. **结果顺序可恢复**：虽然完成顺序可能是 `T0, T1, T2, T3, T4` 也可能穿插，但最终会通过 `task_id` 排序恢复输入顺序。

### 步骤 4：结果收集

每个任务执行后都会 `push` 到 `results`，并携带完整上下文：

- `task_id`：原始顺序 id（非常关键）
- `tool_name / input_data`：可追踪任务来源
- `result`：工具输出或错误文本
- `status`：`success | error`

状态判定有两层：

1. 工具抛异常：进入 `catch`，直接记为 `error`
2. 工具未抛异常但返回了以 `❌` 开头的错误语义文本：也记为 `error`

这就是为什么即使工具内部选择“错误文本返回而非抛错”，聚合层仍能统一识别失败状态。

当前实现中成功/失败判定有两层：

1. 真异常进入 `catch` -> `error`
2. 返回文本以 `❌` 开头也视为 `error`

### 步骤 5：顺序恢复

由于并行执行完成顺序不确定，最后用 `task_id` 排序：

```ts
results.sort((a, b) => a.task_id - b.task_id)
```

这样上层拿到的结果顺序与输入一致，便于比对和展示。

### 步骤 6：统计输出

统计 success 数量并打印汇总日志。

---

## 4.3 `executeToolsBatch(toolName, inputList)`

职责：批量执行同一个工具。

实现方式：

- 把 `inputList` 映射为 `ParallelToolTask[]`
- 复用 `executeToolsParallel` 完成执行

价值：

- 避免重复写批处理循环逻辑；
- 与并行执行共享同一套错误处理、并发控制、结果格式。

---

## 4.4 `close()`

职责：关闭执行器。

行为：

- 设置 `closed = true`
- 输出关闭日志

注意：

- 当前是“软关闭”语义：阻止后续任务启动，不会强制中断已在执行中的 Promise。

---

## 五、便捷函数设计

为减少调用方样板代码，提供 4 个函数：

1. `runParallelTools(...)`
2. `runBatchTool(...)`
3. `runParallelToolsSync(...)`
4. `runBatchToolSync(...)`

其中前两个是核心实现：

- 内部创建 `AsyncToolExecutor`
- `try/finally` 保证 `close()` 一定执行

后两个在 TS 中本质仍返回 `Promise`，是“API 命名兼容层”，用于贴近 Python 版本概念。

---

## 六、与 Python 版本的对齐与差异

## 6.1 对齐点

- 都支持：
  - 单任务异步执行
  - 多任务并行执行
  - 同工具批处理
- 都有统一结果结构（任务信息 + 状态 + 结果）
- 都提供便捷调用函数

## 6.2 差异点

Python 版通过 `ThreadPoolExecutor + asyncio.run_in_executor` 实现并发；
TS 版通过“异步 worker 池 + Promise 并发”实现。

差异原因：

- Node/TS 场景下，I/O 型工具天然适合 Promise 并发；
- 对当前工具执行场景（文本处理、网络请求类）足够高效且实现更简洁。

---

## 七、与 ToolRegistry 的协作边界

边界明确如下：

- `ToolRegistry` 负责：
  - 工具注册与查找
  - 参数校验（Tool/FunctionTool schema）
  - 单次执行
- `AsyncToolExecutor` 负责：
  - 并发调度
  - 任务聚合
  - 结果标准化

这使两者职责清晰，不互相侵入。

---

## 八、典型调用示例

```ts
const tasks = [
  {tool_name: "my_calculator", input_data: "2 + 2"},
  {tool_name: "my_calculator", input_data: "3 * 4"},
  {tool_name: "my_calculator", input_data: "10 / 2"},
];

const results = await runParallelTools(registry, tasks, 4);
```

返回结果示例：

```ts
[
  {task_id: 0, tool_name: "my_calculator", input_data: "2 + 2", result: "4", status: "success"},
  {task_id: 1, tool_name: "my_calculator", input_data: "3 * 4", result: "12", status: "success"},
  {task_id: 2, tool_name: "my_calculator", input_data: "10 / 2", result: "5", status: "success"}
]
```

---

## 九、当前实现的优势与局限

## 9.1 优势

1. 并发上限可控，避免无节制并发。
2. 单任务失败不影响整体，鲁棒性较好。
3. 结果结构统一，上层易消费。
4. 与现有 ToolRegistry 无缝集成，落地成本低。

## 9.2 局限

1. “Sync 包装”在 TS 中仍是 Promise 语义，命名存在误导空间。
2. 当前无任务超时/取消机制。
3. `status` 里用 `result.startsWith("❌")` 判断错误，属于约定式判断。
4. 不区分“可重试错误”与“不可重试错误”。

---

## 十、下一步演进建议

### P1（优先）

1. 为 `ParallelToolResult` 增加 `error_code` / `error_message` 字段，替代前缀字符串判断。
2. 增加任务级超时（例如 `timeoutMs`）并支持超时状态。
3. 补充单元测试：
   - 并发顺序恢复
   - 工具异常隔离
   - 关闭后行为

### P2（增强）

4. 支持失败重试策略（可配置重试次数与退避策略）。
5. 支持并发执行过程中的进度回调（onTaskStart/onTaskDone）。

### P3（高级）

6. 支持 `AbortSignal`，实现外部取消任务。
7. 对 CPU 密集型工具提供 Worker Threads 版本执行器。

---

## 十一、结论

`AsyncToolExecutor` 已经在当前项目中建立了一个稳定、可复用的“并发工具执行层”：

- 向下复用 `ToolRegistry` 的执行能力；
- 向上提供并行/批量任务能力；
- 在异常场景下保持流程可继续。

它非常适合作为 Agent 工具编排的基础设施。后续若补齐超时、取消、重试和更细粒度错误语义，将可进一步升级为生产级并发执行组件。