# @agenticforge/tools-builtin

[![npm](https://img.shields.io/npm/v/@agenticforge/tools-builtin)](https://www.npmjs.com/package/@agenticforge/tools-builtin)
[![license](https://img.shields.io/github/license/LittleBlacky/AgenticFORGE)](https://github.com/LittleBlacky/AgenticFORGE/blob/main/LICENSE)

Ready-to-use built-in tools for AgenticFORGE — search, memory, notes, RAG, and terminal.

## Installation

```bash
npm install @agenticforge/tools-builtin
```

## Built-in Tools

| Tool | Description |
|------|-------------|
| `SearchTool` | Web search supporting Tavily, SerpApi, DuckDuckGo, SearXNG, and Perplexity |
| `MemoryTool` | Memory read/write tool backed by `MemoryManager` |
| `NoteTool` | Structured note management — create, read, update, delete, and search |
| `RagTool` | RAG retrieval tool — import documents and perform semantic Q&A |
| `TerminalTool` | Safe terminal command execution with an allowlist |

## Usage

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

const result = await agent.run(
  "Search for the latest AgenticFORGE updates and save them to memory"
);
console.log(result);
```

### SearchTool — multiple backends

```ts
import {SearchTool} from "@agenticforge/tools-builtin";

// Auto-selects best available backend (Tavily → SerpApi → DuckDuckGo)
const search = new SearchTool({backend: "hybrid"});

// Explicit backend
const tavily = new SearchTool({
  backend: "tavily",
  tavilyKey: process.env.TAVILY_API_KEY,
});
```

### RagTool — document Q&A

```ts
import {RagTool} from "@agenticforge/tools-builtin";

const rag = new RagTool({knowledgeBasePath: "./docs"});

// Add a document
await rag.run({action: "add_document", file_path: "./guide.md"});

// Ask a question
const answer = await rag.run({action: "ask", question: "How do I configure memory?"});
console.log(answer);
```

### NoteTool — structured notes

```ts
import {NoteTool} from "@agenticforge/tools-builtin";

const notes = new NoteTool({workspace: "./agent-notes"});

await notes.run({action: "create", title: "Task State", content: "Step 1 complete.", note_type: "task_state"});
const list = await notes.run({action: "list"});
console.log(list);
```

## Links

- [GitHub](https://github.com/LittleBlacky/AgenticFORGE/tree/main/packages/tools-builtin)
- [npm](https://www.npmjs.com/package/@agenticforge/tools-builtin)
- [Root README](https://github.com/LittleBlacky/AgenticFORGE)
