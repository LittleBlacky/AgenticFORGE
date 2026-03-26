# RAG Pipeline

The built-in RAG pipeline lets you index documents and answer questions grounded in your own content.

## How it works

```
Documents → Chunking → Embedding → Vector Store
                                        ↓
User Query → Embedding → Similarity Search → Top-K Chunks → LLM → Answer
```

## Quick example

```ts
import {createRagPipeline} from "@agenticforge/memory/rag";

const rag = createRagPipeline({ragNamespace: "my-docs"});

// Index documents
const count = await rag.addDocuments(["./guide.md", "./api.md"]);
console.log(`Indexed ${count} chunks`);

// Basic search
const hits = await rag.search("how to configure memory", 5);
hits.forEach((h) => console.log(h.content));

// Advanced search (MQE + HyDE)
const hits2 = await rag.searchAdvanced("memory configuration", 8, true, true);
```

## With Qdrant backend

```ts
import {createRagPipeline} from "@agenticforge/memory/rag";
import {createDefaultVectorStore} from "@agenticforge/memory/storage";

const store = createDefaultVectorStore({
  backend: "qdrant",
  qdrantUrl: "http://localhost:6333",
  qdrantCollection: "docs",
  qdrantVectorSize: 384,
});

const rag = createRagPipeline({ragNamespace: "docs", store});
await rag.addDocuments(["./README.md"]);
```

## RagTool (for agents)

```ts
import {RagTool} from "@agenticforge/tools-builtin";

const rag = new RagTool({knowledgeBasePath: "./kb"});

// Add a document
await rag.run({action: "add_document", file_path: "./guide.md"});

// Ask a question
const answer = await rag.run({
  action: "ask",
  question: "How do I use the memory system?",
});
console.log(answer);
```

## Chunking options

```ts
await rag.addDocuments(
  ["./large-doc.md"],
  800,   // chunkSize (tokens)
  100,   // chunkOverlap (tokens)
);
```
