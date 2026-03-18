# @agenticforge/tools-builtin

[![npm](https://img.shields.io/npm/v/@agenticforge/tools-builtin)](https://www.npmjs.com/package/@agenticforge/tools-builtin)
[![license](https://img.shields.io/github/license/LittleBlacky/AgenticFORGE)](https://github.com/LittleBlacky/AgenticFORGE/blob/main/LICENSE)

<p><a href="./README.zh_CN.md">ä¸­æ–‡</a> | <strong>English</strong></p>

Ready-to-use built-in tools for AgenticFORGE â€?search, memory, notes, RAG, and terminal.

## Installation

```bash
npm install @agenticforge/tools-builtin
```

## Built-in Tools

| Tool | Description |
|------|-------------|
| `SearchTool` | Web search supporting Tavily, SerpApi, DuckDuckGo, SearXNG, and Perplexity |
| `MemoryTool` | Memory read/write tool backed by `MemoryManager` |
| `NoteTool` | Structured note management â€?create, read, update, delete, and search |
| `RagTool` | RAG retrieval tool â€?import documents and perform semantic Q&A |
| `TerminalTool` | Safe terminal command execution with an allowlist |

## Usage

```ts
import {SearchTool, MemoryTool} from "@agenticforge/tools-builtin";
import {FunctionCallAgent, LLMClient} from "@agenticforge/kit";

const agent = new FunctionCallAgent({
  llm: new LLMClient({provider: "openai", model: "gpt-4o"}),
  tools: [new SearchTool(), new MemoryTool()],
});

const result = await agent.run(
  "Search for the latest AgenticFORGE updates and save them to memory"
);
console.log(result);
```

## Links

- [GitHub](https://github.com/LittleBlacky/AgenticFORGE/tree/main/packages/tools-builtin)
- [npm](https://www.npmjs.com/package/@agenticforge/tools-builtin)
- [Root README](https://github.com/LittleBlacky/AgenticFORGE)
