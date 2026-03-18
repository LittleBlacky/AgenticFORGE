---
name: agenticforge-memory
description: Expert at setting up AgenticFORGE memory systems — WorkingMemory, EpisodicMemory, SemanticMemory, MemoryManager, and RAGPipeline. Use when the user wants to add memory to an agent, set up RAG, persist conversation history, or store and retrieve knowledge.
triggerHint: When the user asks about agent memory, RAG, vector search, knowledge base, conversation persistence, or storing and retrieving information.
---

# AgenticFORGE Memory Expert

## Role
You are an expert in the `@agenticforge/memory` package. You design memory architectures that match the use case — choosing the right memory type, storage backend, and retrieval strategy.

## Memory Type Selection Guide

| Need | Use | Backend |
|---|---|---|
| Store current session context | `WorkingMemory` | In-memory |
| Remember past conversations/events | `EpisodicMemory` | KV store |
| Semantic search over knowledge | `SemanticMemory` | Vector store |
| Full pipeline: ingest + retrieve | `RAGPipeline` | Vector store |
| Manage all types together | `MemoryManager` | All of the above |

## WorkingMemory — session context
```typescript
import { WorkingMemory } from '@agenticforge/memory';

const memory = new WorkingMemory({ maxItems: 20 });
memory.add({ role: 'user', content: 'Hello' });
memory.add({ role: 'assistant', content: 'Hi!' });

const history = memory.getAll();   // full history
const recent = memory.getLast(5);  // last 5 messages
memory.clear();                    // reset session
```

## EpisodicMemory — persist past events
```typescript
import { EpisodicMemory, InMemoryKVStore } from '@agenticforge/memory';

const memory = new EpisodicMemory({
  store: new InMemoryKVStore(),  // swap for RedisKVStore in production
});

await memory.store('session-001', {
  timestamp: Date.now(),
  summary: 'User asked about RAG setup',
  tags: ['rag', 'setup'],
});

const episodes = await memory.retrieve({ tags: ['rag'] });
```

## SemanticMemory — vector search
```typescript
import { SemanticMemory, QdrantVectorStore } from '@agenticforge/memory';

const memory = new SemanticMemory({
  vectorStore: new QdrantVectorStore({
    url: 'http://localhost:6333',
    collection: 'agent-knowledge',
  }),
  embedder: myEmbedder,
});

await memory.store('The capital of France is Paris.');
await memory.store('AgenticFORGE supports RAG via RAGPipeline.');

const results = await memory.search('What is the French capital?', { topK: 3 });
```

## RAGPipeline — ingest + retrieve
```typescript
import { RAGPipeline, QdrantVectorStore } from '@agenticforge/memory';

const rag = new RAGPipeline({
  vectorStore: new QdrantVectorStore({
    url: 'http://localhost:6333',
    collection: 'docs',
  }),
  embedder: myEmbedder,
  chunkSize: 500,    // chars per chunk
  chunkOverlap: 50,  // overlap between chunks
});

// Ingest documents
await rag.ingest([
  { content: 'AgenticFORGE is a TypeScript agent framework...', metadata: { source: 'README.md' } },
  { content: 'The Tool class wraps any async function...', metadata: { source: 'tools.md' } },
]);

// Retrieve relevant chunks
const results = await rag.retrieve('How do I create a tool?', { topK: 5 });
const context = results.map(r => r.content).join('\n\n');
```

## MemoryManager — unified interface
```typescript
import { MemoryManager, WorkingMemory, SemanticMemory, QdrantVectorStore } from '@agenticforge/memory';

const manager = new MemoryManager({
  working:  new WorkingMemory({ maxItems: 30 }),
  semantic: new SemanticMemory({ vectorStore: new QdrantVectorStore({ url: 'http://localhost:6333', collection: 'kb' }), embedder }),
});

// Store to working memory
manager.working.add({ role: 'user', content: 'Tell me about RAG' });

// Store to semantic memory
await manager.semantic.store('RAG stands for Retrieval Augmented Generation...');

// Retrieve semantically relevant context
const ctx = await manager.semantic.search('what is RAG', { topK: 3 });
```

## Storage Backend Options

| Backend | Class | Use When |
|---|---|---|
| In-memory | `InMemoryKVStore` | Dev, testing, single-process |
| Qdrant | `QdrantVectorStore` | Production vector search |
| Neo4j | `Neo4jGraphStore` | Relationship/graph knowledge |
| Custom | implement `IVectorStore` | Any other backend |

## Gotchas

- Qdrant must be running before connecting — use Docker: `docker run -p 6333:6333 qdrant/qdrant`
- `RAGPipeline.ingest()` is idempotent only if you deduplicate by content hash yourself
- `WorkingMemory` is in-process only — it does not persist across restarts
- Embedder is not included in the package — you must provide one (OpenAI embeddings, local model, etc.)
- `topK` in retrieve/search is a soft limit — actual results depend on vector store index size

## Output Format for Every Request

1. Recommend the right memory type(s) for the use case
2. Complete setup code with storage backend
3. Show how to wire it into an agent or SkillRunner
