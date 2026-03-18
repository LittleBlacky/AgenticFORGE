# 工具

工具是 AgenticFORGE 的核心执行原语，Agent 的所有行动都通过工具完成。

## 定义工具

```ts
import {Tool, toolAction} from "@agenticforge/tools";
import {z} from "zod";

const calcTool = new Tool({
  name: "calculator",
  description: "计算数学表达式并返回结果",
  parameters: [
    {
      name: "expression",
      type: "string",
      description: "合法的 JavaScript 数学表达式，如 '2 + 2 * 3'",
      required: true,
    },
  ],
  action: toolAction(
    z.object({expression: z.string()}),
    async ({expression}) => {
      try {
        return String(eval(expression));
      } catch {
        return "无效表达式";
      }
    }
  ),
});
```

## ToolRegistry

```ts
import {ToolRegistry} from "@agenticforge/tools";

const registry = new ToolRegistry();
registry.register(calcTool);

const tool = registry.get("calculator");
const result = await tool.execute({expression: "(10 + 5) * 2"});
console.log(result); // "30"

console.log(registry.list()); // ["calculator"]
```

## ToolChain

将多个工具串联，前一个工具的输出作为下一个工具的输入：

```ts
import {ToolChain} from "@agenticforge/tools";

const chain = new ToolChain([fetchTool, parseTool, summarizeTool]);
const result = await chain.run({url: "https://example.com/article"});
```

## AsyncToolExecutor

并发运行多个工具，支持超时和并发数控制：

```ts
import {AsyncToolExecutor} from "@agenticforge/tools";

const executor = new AsyncToolExecutor({
  concurrency: 3,
  timeoutMs: 10000,
});

const results = await executor.runAll([
  {tool: searchTool, params: {query: "AI Agent"}},
  {tool: searchTool, params: {query: "向量数据库"}},
  {tool: searchTool, params: {query: "LLM 基准测试"}},
]);
```

## 内置工具

详见 [@agenticforge/tools-builtin](/zh/packages/tools-builtin)：

| 工具 | 说明 |
|------|------|
| `SearchTool` | 网络搜索（Tavily / SerpApi / DuckDuckGo / SearXNG / Perplexity）|
| `MemoryTool` | 读写 Agent 记忆 |
| `NoteTool` | 结构化笔记管理 |
| `RagTool` | 文档索引与语义问答 |
| `TerminalTool` | 安全终端命令执行 |
