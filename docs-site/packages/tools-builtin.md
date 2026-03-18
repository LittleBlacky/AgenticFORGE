# @agenticforge/tools-builtin

[![npm](https://img.shields.io/npm/v/@agenticforge/tools-builtin)](https://www.npmjs.com/package/@agenticforge/tools-builtin)

Ready-to-use built-in tools — search, memory, notes, RAG, and terminal.

## Installation

```bash
npm install @agenticforge/tools-builtin
```

## Available tools

| Tool | Description |
|------|-------------|
| `SearchTool` | Web search: Tavily, SerpApi, DuckDuckGo, SearXNG, Perplexity |
| `MemoryTool` | Read/write agent memory via `MemoryManager` |
| `NoteTool` | Structured note CRUD with file locking |
| `RagTool` | Document indexing and semantic Q&A |
| `TerminalTool` | Safe terminal commands via allowlist |

## SearchTool

```ts
import {SearchTool} from "@agenticforge/tools-builtin";

// Auto-selects best available backend
const search = new SearchTool({backend: "hybrid"});

// Explicit Tavily
const tavily = new SearchTool({
  backend: "tavily",
  tavilyKey: process.env.TAVILY_API_KEY,
});

const result = await search.run({input: "latest AI agent frameworks"});
```

## NoteTool

```ts
import {NoteTool} from "@agenticforge/tools-builtin";

const notes = new NoteTool({workspace: "./agent-notes"});

await notes.run({
  action: "create",
  title: "Task Status",
  content: "Step 1 complete. Next: run evaluation.",
  note_type: "task_state",
});

const list = await notes.run({action: "list"});
```

## RagTool

```ts
import {RagTool} from "@agenticforge/tools-builtin";

const rag = new RagTool({knowledgeBasePath: "./docs"});

await rag.run({action: "add_document", file_path: "./guide.md"});

const answer = await rag.run({
  action: "ask",
  question: "How do I configure the memory system?",
});
console.log(answer);
```

## TerminalTool

```ts
import {TerminalTool} from "@agenticforge/tools-builtin";

const terminal = new TerminalTool({workspace: "/safe/dir"});
const output = await terminal.run({command: "ls -la"});
```

::: warning
`TerminalTool` uses an allowlist of safe commands. `rm`, `curl`, `wget` and other destructive commands are blocked by default.
:::
