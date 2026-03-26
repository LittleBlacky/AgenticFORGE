# Installation

## All-in-one (recommended)

```bash
npm install @agenticforge/kit
# or
pnpm add @agenticforge/kit
```

`@agenticforge/kit` re-exports everything from all sub-packages. Import any symbol directly:

```ts
import {
  LLMClient,
  FunctionCallAgent,
  Tool,
  toolAction,
  MemoryManager,
  ContextBuilder,
  SearchTool,
} from "@agenticforge/kit";
```

## Individual packages

For leaner bundles, install only what you need:

```bash
npm install @agenticforge/core @agenticforge/tools @agenticforge/agents
```

## Tree-shakeable sub-path imports

`@agenticforge/memory` ships with 6 sub-path exports so you only download what you use:

```ts
// Only 7.6 KB — no qdrant / neo4j / openai embedding
import {MemoryManager} from "@agenticforge/memory/manager";

// RAG pipeline only (~30 KB)
import {createRagPipeline} from "@agenticforge/memory/rag";

// Storage adapters only (~8 KB)
import {QdrantVectorStore} from "@agenticforge/memory/storage";

// Embedding factory only (~0.6 KB)
import {createDefaultTextEmbedder} from "@agenticforge/memory/embedding";
```

## Peer dependencies

| Dependency | Required by | Notes |
|------------|-------------|-------|
| `zod` | `@agenticforge/tools`, `@agenticforge/tools-builtin` | Tool parameter validation |
| `openai` | `@agenticforge/core` | LLM client |
| `reflect-metadata` | `@agenticforge/tools`, `@agenticforge/agents` | Decorator support |
| `@qdrant/js-client-rest` | `@agenticforge/memory` | Optional: Qdrant backend |
| `neo4j-driver` | `@agenticforge/memory` | Optional: Neo4j backend |

## Environment variables

```bash
# Required for LLM calls
OPENAI_API_KEY=sk-...

# Optional: for Qdrant storage
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=your-key

# Optional: for web search tools
TAVILY_API_KEY=tvly-...
SERPAPI_API_KEY=...
```
