# @agenticforge/tools

[![npm](https://img.shields.io/npm/v/@agenticforge/tools)](https://www.npmjs.com/package/@agenticforge/tools)
[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)

<p><strong>中文</strong> | <a href="./README.md">English</a></p>

AgenticFORGE 工具核心包，提供 `Tool` 抽象基类、`ToolRegistry`、`ToolChain` 与异步执行器。

## 安装

```bash
npm install @agenticforge/tools
```

## 主要导出

| 名称 | 说明 |
|------|------|
| `Tool` | 抽象基类 — 继承它来定义带类型参数和执行逻辑的工具 |
| `defineFunctionTool` | 轻量函数工具工厂，支持可选 Zod schema |
| `ToolRegistry` | 工具注册表，统一管理和执行工具 |
| `ToolChain` | 顺序管道 — 将多个工具串联，前一步输出作为后一步输入 |
| `ToolChainManager` | 管理多个命名的 `ToolChain` 实例 |
| `AsyncToolExecutor` | 有并发上限的批量工具执行器 |

## 使用示例

### 继承 `Tool`（推荐用于复杂工具）

```ts
import { Tool, ToolRegistry } from "@agenticforge/tools";
import type { ToolParameter } from "@agenticforge/tools";

class SearchTool extends Tool {
  constructor() {
    super("search", "搜索互联网信息");
  }

  getParameters(): ToolParameter[] {
    return [
      { name: "query", type: "string", description: "搜索关键词", required: true, default: null },
      { name: "limit", type: "number", description: "最大结果数", required: false, default: 5 },
    ];
  }

  async run(params: Record<string, unknown>): Promise<string> {
    return `搜索结果：${params.query} 相关内容...`;
  }
}

const registry = new ToolRegistry();
registry.registerTool(new SearchTool());

const result = await registry.execute("search", { query: "AgenticFORGE" });
console.log(result);
```

### 自定义 Zod schema（可选）

需要比自动生成更精确的校验时，覆盖 `zodSchema()` 方法：

```ts
import { Tool, z } from "@agenticforge/tools";
import type { ToolParameter } from "@agenticforge/tools";

class FetchUrlTool extends Tool {
  constructor() {
    super("fetch-url", "获取网页内容");
  }

  getParameters(): ToolParameter[] {
    return [
      { name: "url", type: "string", description: "目标 URL", required: true, default: null },
    ];
  }

  // 覆盖以启用更严格的校验（如 URL 格式验证）
  protected zodSchema() {
    return z.object({
      url: z.string().url("必须是合法的 URL 格式"),
    });
  }

  async run(params: Record<string, unknown>): Promise<string> {
    const res = await fetch(String(params.url));
    return await res.text();
  }
}
```

### 使用 `defineFunctionTool`（轻量函数工具）

```ts
import { defineFunctionTool, ToolRegistry } from "@agenticforge/tools";
import { z } from "zod";

const echoTool = defineFunctionTool({
  name: "echo",
  description: "将输入原样返回",
  schema: z.object({ message: z.string() }),
  func: ({ message }) => message.toUpperCase(),
});

const registry = new ToolRegistry();
registry.registerFunction(echoTool.name, echoTool.description, echoTool.func, echoTool.schema);
```

### ToolChain — 顺序管道

```ts
import { ToolChain, ToolRegistry } from "@agenticforge/tools";

const chain = new ToolChain("search-and-summarize", "搜索后摘要");
chain.addStep("search",    "{input}",       "raw_results");
chain.addStep("summarize", "{raw_results}", "summary");

const result = await chain.execute(registry, "AgenticFORGE 最新动态");
console.log(result); // summary 步骤的输出
```

### AsyncToolExecutor — 并发批量执行

```ts
import { AsyncToolExecutor, ToolRegistry } from "@agenticforge/tools";

const executor = new AsyncToolExecutor(registry, 4); // 最多 4 个并发
const results = await executor.executeBatch([
  { id: "r1", toolName: "search", parameters: { query: "AI 新闻" } },
  { id: "r2", toolName: "search", parameters: { query: "前端趋势" } },
]);

for (const r of results) {
  console.log(r.id, r.output, r.durationMs);
}
```

## 参数校验机制

`Tool` 子类内置了基于 Zod 的自动参数校验，无需额外代码：

| 行为 | 说明 |
|---|---|
| 必填字段检查 | 缺少 required 参数时返回 `Error: <字段>: Required` |
| 类型强制转换 | `number` / `boolean` 类型参数会自动从字符串转换（如 `"42"` → `42`） |
| 默认值填充 | 可选参数缺省时自动填入 `default` 值 |
| 自定义 schema | 覆盖 `zodSchema()` 以启用精确规则（`.url()`、`.email()`、`.min()` 等） |

`ToolRegistry.execute()` 执行时会先做参数校验，校验失败返回 `"Error: ..."` 字符串（对 LLM 友好），而不是抛出异常。

## 链接

- [GitHub](https://github.com/LittleBlacky/AgenticFORGE/tree/main/packages/tools)
- [npm](https://www.npmjs.com/package/@agenticforge/tools)
- [主项目 README](https://github.com/LittleBlacky/AgenticFORGE)
