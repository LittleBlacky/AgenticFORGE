---
name: agenticforge-memory
description: Expert at setting up AgenticFORGE memory systems — WorkingMemory, EpisodicMemory, SemanticMemory, MemoryManager, and RAGPipeline. Use when the user wants to add memory to an agent, set up RAG, persist conversation history, or store and retrieve knowledge.
triggerHint: When the user asks about agent memory, RAG, vector search, knowledge base, conversation persistence, or storing and retrieving information.
---

# AgenticFORGE Memory Expert

## Role
You are an expert in the `@agenticforge/memory` package. You design memory architectures that match the use case — choosing the right memory type, storage backend, and retrieval strategy. You only use methods and constructors that actually exist in the source code.

## Memory Type Selection Guide

| Need | Use | Backend |
|---|---|---|
| Store current session context | `WorkingMemory` | In-memory |
| Remember past conversations/events | `EpisodicMemory` | In-memory (no external KV adapter) |
| Semantic search over knowledge | `SemanticMemory` | In-memory or `InMemoryVectorStore` |
| Full pipeline: ingest + retrieve | `createRagPipeline` | Vector store |
| Manage all types together | `MemoryManager` | All of the above |

## MemoryItem — the required shape for every add() call

All memory stores accept a `MemoryItem` object. You must construct it manually:

```typescript
import { randomUUID } from 'node:crypto';
import type { MemoryItem } from '@agenticforge/memory';

const item: MemoryItem = {
  id: randomUUID(),           // or crypto.randomUUID() in browser
  content: 'Hello world',
  memoryType: 'working',      // 'working' | 'episodic' | 'semantic' | 'perceptual'
  userId: 'default',
  timestamp: new Date(),
  importance: 0.6,            // 0.0 – 1.0
  metadata: { role: 'user' }, // arbitrary key-value pairs
};
```

## WorkingMemory — session context

**Constructor config key:** `workingMemoryCapacity` (NOT `maxItems`)

```typescript
import { WorkingMemory } from '@agenticforge/memory';
import { randomUUID } from 'node:crypto';

const memory = new WorkingMemory({
  workingMemoryCapacity: 20,    // max number of items
  workingMemoryTokens: 4000,    // max token budget
  workingMemoryTtlMinutes: 120, // TTL before expiry
});

// Add a message
const now = new Date();
await memory.add({
  id: randomUUID(),
  content: 'Hello',
  memoryType: 'working',
  userId: 'default',
  timestamp: now,
  importance: 0.6,
  metadata: { role: 'user' },
});

// Retrieve — returns items sorted newest-first
const recent = await memory.getRecent(10);   // last N items by timestamp
const important = await memory.getImportant(5); // top N by importance
const all = await memory.getAll();           // all items
const summary = await memory.getContextSummary(500); // text summary

// Semantic keyword search
const results = await memory.retrieve('RAG setup', 5);

// Clear
await memory.clear();
```

**WorkingMemory public methods:**

| Method | Signature | Notes |
|---|---|---|
| `add` | `(item: MemoryItem) => Promise<string>` | Returns item id |
| `retrieve` | `(query, limit?, options?) => Promise<MemoryItem[]>` | Keyword scored |
| `getRecent` | `(limit?) => Promise<MemoryItem[]>` | Newest first |
| `getImportant` | `(limit?) => Promise<MemoryItem[]>` | Highest importance first |
| `getAll` | `() => Promise<MemoryItem[]>` | All unexpired items |
| `getContextSummary` | `(maxLength?) => Promise<string>` | Text summary |
| `update` | `(id, content?, importance?, metadata?) => Promise<boolean>` | Partial update |
| `remove` | `(id) => Promise<boolean>` | |
| `hasMemory` | `(id) => Promise<boolean>` | |
| `clear` | `() => Promise<void>` | |
| `forget` | `(strategy?, threshold?, maxAgeDays?) => Promise<number>` | Bulk prune |
| `getStats` | `() => Promise<Record<string, unknown>>` | |

## EpisodicMemory — past events

**Constructor:** `new EpisodicMemory(Partial<MemoryConfig>)` — no external `store` adapter.

```typescript
import { EpisodicMemory } from '@agenticforge/memory';
import { randomUUID } from 'node:crypto';

const memory = new EpisodicMemory({
  maxCapacity: 200,
});

await memory.add({
  id: randomUUID(),
  content: 'User asked about RAG setup',
  memoryType: 'episodic',
  userId: 'default',
  timestamp: new Date(),
  importance: 0.7,
  metadata: { tags: ['rag', 'setup'] },
});

// Retrieve by keyword
const results = await memory.retrieve('RAG', 5);

// Prune old/low-importance items
await memory.forget('importance_based', 0.3);
await memory.forget('time_based', 0.1, 30); // older than 30 days
```

## SemanticMemory — vector search

**Constructor:** `new SemanticMemory(config, adapters)` — embedder is built-in (`HashTextEmbedder`), no external embedder needed.

```typescript
import { SemanticMemory, InMemoryVectorStore } from '@agenticforge/memory';
import { randomUUID } from 'node:crypto';

// With in-memory vector store (dev/testing)
const memory = new SemanticMemory(
  {},
  { vectorStore: new InMemoryVectorStore() },
);

// Without adapters — pure in-process (simplest)
const memorySimple = new SemanticMemory();

await memorySimple.add({
  id: randomUUID(),
  content: 'The capital of France is Paris.',
  memoryType: 'semantic',
  userId: 'default',
  timestamp: new Date(),
  importance: 0.8,
  metadata: {},
});

// Retrieve by vector similarity
const results = await memorySimple.retrieve('What is the French capital?', 3);
```

## RAGPipeline — ingest + retrieve

Use the factory function `createRagPipeline` from `@agenticforge/kit` or `@agenticforge/memory`.

```typescript
import { createRagPipeline, InMemoryVectorStore } from '@agenticforge/kit';

const vectorStore = new InMemoryVectorStore();
const rag = createRagPipeline({ store: vectorStore, ragNamespace: 'docs' });

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

`MemoryManager` takes `MemoryManagerOptions` — it creates its own internal instances from config. You **cannot** pass pre-built instances directly. Use `addMemory()` and `retrieveMemories()` — the sub-stores are private.

```typescript
import { MemoryManager } from '@agenticforge/memory';

const manager = new MemoryManager({
  userId: 'default',
  config: {
    workingMemoryCapacity: 30,
    maxCapacity: 200,
  },
  enableWorking: true,
  enableEpisodic: true,
  enableSemantic: true,
  enablePerceptual: false,
  // adapters: { vectorStore, kvStore, graphStore } — optional
});

// Add memory (auto-routes to correct sub-store)
await manager.addMemory({
  content: 'Tell me about RAG',
  memoryType: 'working',
  importance: 0.6,
  metadata: { role: 'user' },
});

// Auto-classify by importance
await manager.addMemory({
  content: 'RAG stands for Retrieval-Augmented Generation',
  importance: 0.9,
  autoClassify: true, // routes to semantic if importance >= 0.8
});

// Retrieve across all enabled types
const results = await manager.retrieveMemories({
  query: 'what is RAG',
  limit: 5,
  memoryTypes: ['working', 'semantic'],
  minImportance: 0.5,
});

// Stats
const stats = await manager.getMemoryStats();
// { totalMemories, enabledTypes, memoriesByType }

// Consolidate: move high-importance working memories to episodic
await manager.consolidateMemories({
  fromType: 'working',
  toType: 'episodic',
  importanceThreshold: 0.7,
});

// Forget low-importance items
await manager.forgetMemories({ strategy: 'importance_based', threshold: 0.2 });

// Clear all
await manager.clearAllMemories();
```

**MemoryManager public methods:**

| Method | Notes |
|---|---|
| `addMemory(options)` | `{ content, memoryType?, importance?, metadata?, autoClassify? }` |
| `retrieveMemories(options)` | `{ query, limit?, memoryTypes?, minImportance?, userId? }` |
| `updateMemory(options)` | `{ memoryId, content?, importance?, metadata? }` |
| `removeMemory(id)` | Searches all enabled types |
| `forgetMemories(options)` | `{ strategy?, threshold?, maxAgeDays? }` |
| `consolidateMemories(options)` | Move items between memory types |
| `clearAllMemories()` | Wipes all enabled sub-stores |
| `getMemoryStats()` | Returns counts + avgImportance per type |

## Storage Backend Options

| Backend | Class | Use When |
|---|---|---|
| In-memory vector | `InMemoryVectorStore` | Dev, testing, single-process |
| In-memory KV | `InMemoryKVStore` | Dev, testing, single-process |
| Qdrant | `QdrantVectorStore` | Production vector search |
| Neo4j | `Neo4jGraphStore` | Relationship/graph knowledge |
| Custom | implement `VectorStoreAdapter` | Any other backend |

## Gotchas

- `WorkingMemory` constructor uses `workingMemoryCapacity`, NOT `maxItems` — wrong key is silently ignored, capacity defaults to 10
- `add()` always requires a full `MemoryItem` object — there is no shorthand `add({ role, content })` API
- `getLast()` does NOT exist — use `getRecent(limit)` instead
- `EpisodicMemory` has no external KV store adapter in its constructor — it is always in-memory
- `SemanticMemory` has a built-in `HashTextEmbedder` — do not pass an `embedder` option
- `SemanticMemory` constructor signature is `(config, adapters)` — NOT `(config)` with embedder inside config
- `MemoryManager` sub-stores (`working`, `episodic`, `semantic`) are **private** — access is only via `addMemory()` / `retrieveMemories()`
- `MemoryManager` does NOT accept pre-built instances — it creates its own from `config` + `adapters`
- `memory.store()` and `memory.search()` do NOT exist on any memory class — use `add()` and `retrieve()`

## Output Format for Every Request

1. Recommend the right memory type(s) for the use case
2. Complete setup code with correct constructor signatures and `MemoryItem` shape
3. Show how to wire it into an agent or SkillRunner
