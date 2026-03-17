# @agenticforge/tools-builtin

[![npm](https://img.shields.io/npm/v/@agenticforge/tools-builtin)](https://www.npmjs.com/package/@agenticforge/tools-builtin)
[![license](https://img.shields.io/github/license/LittleBlacky/AgenticFORGE)](https://github.com/LittleBlacky/AgenticFORGE/blob/main/LICENSE)

AgenticFORGE 内置工具集，提供搜索、记忆、笔记、RAG、终端命令等常用工具，开箱即用。

> Built-in tools for AgenticFORGE: search, memory, note, RAG, and terminal.

## 安装

```bash
npm install @agenticforge/tools-builtin
```

## 内置工具

| 工具 | 说明 |
|------|------|
| `SearchTool` | 网络搜索工具，支持多种搜索引擎 |
| `MemoryTool` | 记忆读写工具，对接 MemoryManager |
| `NoteTool` | 笔记管理工具，支持创建/读取/搜索笔记 |
| `RagTool` | RAG 检索增强工具，支持文档导入与语义检索 |
| `TerminalTool` | 终端命令执行工具 |

## 使用示例

```ts
import {SearchTool, MemoryTool} from "@agenticforge/tools-builtin";
import {FunctionCallAgent} from "@agenticforge/agents";
import {LLMClient} from "@agenticforge/core";

const llm = new LLMClient({provider: "openai", model: "gpt-4o"});

const agent = new FunctionCallAgent({
  llm,
  tools: [
    new SearchTool(),
    new MemoryTool(),
  ],
});

const result = await agent.run("搜索 AgenticFORGE 最新动态并记录到记忆");
console.log(result);
```

## 链接

- [GitHub](https://github.com/LittleBlacky/AgenticFORGE/tree/main/packages/tools-builtin)
- [npm](https://www.npmjs.com/package/@agenticforge/tools-builtin)
- [主项目 README](https://github.com/LittleBlacky/AgenticFORGE)
