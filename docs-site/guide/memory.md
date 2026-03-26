# Memory

AgenticFORGE provides a unified `MemoryManager` that handles four distinct memory types, each designed for a different temporal and semantic role.

## Memory types

| Type | Scope | Use Case |
|------|-------|----------|
| `working` | Session-level | Current task context, recent messages |
| `episodic` | Long-term, time-indexed | Past events, conversation history |
| `semantic` | Long-term, concept-indexed | Facts, preferences, domain knowledge |
| `perceptual` | Short-term buffer | Raw inputs (images, audio, files) |

## Basic usage

```ts
import {MemoryManager} from "@agenticforge/memory/manager";

const memory = new MemoryManager({
  userId: "user-123",
  enableWorking: true,
  enableEpisodic: true,
  enableSemantic: true,
});

// Add a memory
await memory.addMemory({
  content: "User is building a TypeScript agent framework",
  memoryType: "semantic",
  importance: 0.9,
  metadata: {source: "conversation", timestamp: new Date().toISOString()},
});

// Retrieve relevant memories
const results = await memory.retrieveMemories({
  query: "what is the user working on?",
  limit: 5,
  memoryTypes: ["semantic", "episodic"],
  minImportance: 0.5,
});

console.log(results.map((r) => r.content));
```

## Memory operations

```ts
// Update a memory
await memory.updateMemory({
  memoryId: "mem-abc123",
  content: "Updated content",
  importance: 0.95,
});

// Remove a memory
await memory.removeMemory("mem-abc123");

// Forget old or low-importance memories
await memory.forgetMemories({
  strategy: "importance_based",
  threshold: 0.2,
});

await memory.forgetMemories({
  strategy: "time_based",
  maxAgeDays: 30,
});

// Consolidate working memory into episodic
await memory.consolidateMemories({
  fromType: "working",
  toType: "episodic",
  importanceThreshold: 0.7,
});

// Stats
const stats = await memory.getMemoryStats();
console.log(stats.totalMemories);
```

## Qdrant vector storage

For production use, connect a vector database:

```ts
import {MemoryManager} from "@agenticforge/memory/manager";

const memory = new MemoryManager({
  enableSemantic: true,
  adapterConfigs: [
    {
      type: "vectorStore",
      backend: "qdrant",
      options: {
        url: process.env.QDRANT_URL ?? "http://localhost:6333",
        apiKey: process.env.QDRANT_API_KEY,
        collection: "agent-memory",
      },
    },
  ],
});

await memory.initialize();
```

## Neo4j graph storage

```ts
const memory = new MemoryManager({
  enableEpisodic: true,
  adapterConfigs: [
    {
      type: "graphStore",
      backend: "neo4j",
      options: {
        url: "bolt://localhost:7687",
        username: "neo4j",
        password: process.env.NEO4J_PASSWORD,
      },
    },
  ],
});

await memory.initialize();
```

## Start Qdrant + Neo4j with Docker

```bash
# Qdrant
docker run -p 6333:6333 qdrant/qdrant

# Neo4j
docker run -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/password \
  neo4j:latest
```
