# @agenticforge/tools-builtin

[![npm](https://img.shields.io/npm/v/@agenticforge/tools-builtin)](https://www.npmjs.com/package/@agenticforge/tools-builtin)

开箱即用的内置工具集 — 搜索、记忆、笔记、RAG、终端。

## 安装

```bash
npm install @agenticforge/tools-builtin
```

## 内置工具

| 工具 | 说明 |
|------|------|
| `SearchTool` | 网络搜索，支持 Tavily / SerpApi / DuckDuckGo / SearXNG / Perplexity |
| `MemoryTool` | 读写 Agent 记忆 |
| `NoteTool` | 结构化笔记 CRUD，带文件锁 |
| `RagTool` | 文档索引与语义问答 |
| `TerminalTool` | 安全终端命令，白名单机制 |

## 使用示例

```ts
import {SearchTool, MemoryTool} from "@agenticforge/tools-builtin";
import {FunctionCallAgent, LLMClient} from "@agenticforge/kit";

const agent = new FunctionCallAgent({
  llm: new LLMClient({provider: "openai", model: "gpt-4o"}),
  tools: [new SearchTool(), new MemoryTool()],
});

const result = await agent.run("搜索 AgenticFORGE 最新动态并记录到记忆。");
console.log(result);
```
