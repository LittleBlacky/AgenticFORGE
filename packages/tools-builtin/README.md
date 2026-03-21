# @agenticforge/tools-builtin

[![npm](https://img.shields.io/npm/v/@agenticforge/tools-builtin)](https://www.npmjs.com/package/@agenticforge/tools-builtin)
[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)


<p><a href="./README.zh_CN.md">中文</a> | <strong>English</strong></p>

Ready-to-use built-in tools for AgenticFORGE �?search, memory, notes, RAG, and terminal.

## Installation

```bash
npm install @agenticforge/tools-builtin
```

## Built-in Tools

| Tool | Description |
|------|-------------|
| `SearchTool` | Web search supporting Tavily, SerpApi, DuckDuckGo, SearXNG, and Perplexity |
| `MemoryTool` | Memory read/write tool backed by `MemoryManager` |
| `NoteTool` | Structured note management �?create, read, update, delete, and search |
| `RagTool` | RAG retrieval tool �?import documents and perform semantic Q&A |
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
