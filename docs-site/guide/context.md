# Context Builder

The `ContextBuilder` assembles LLM messages within a token budget. It supports MMR-based diversity selection, TF-IDF or dense-vector similarity, and recency-based time decay scoring.

## Basic usage

```ts
import {ContextBuilder} from "@agenticforge/context";

const builder = new ContextBuilder();

const result = await builder.build({
  systemInstructions: "You are a professional code assistant.",
  userQuery: "Refactor this function for readability.",
  conversationHistory: history,
});

// result.system   → system prompt string
// result.messages → Message[] (history + user query)
// result.totalTokens → estimated token count
// result.includedPackets → selected ContextPackets
```

## Adding context packets

`additionalPackets` are extra knowledge chunks (RAG results, memory snippets, tool outputs) ranked and selected within the token budget.

```ts
import {ContextPacketBuilder} from "@agenticforge/context";

const result = await builder.build({
  userQuery: "How does vector search work?",
  additionalPackets: [
    ContextPacketBuilder.withRelevance(
      ContextPacketBuilder.create(
        "Vector search finds semantically similar documents using embeddings.",
        {source: "docs"},
      ),
      0.92,
    ),
    ContextPacketBuilder.withRelevance(
      ContextPacketBuilder.create(
        "HNSW is a graph-based approximate nearest neighbour algorithm.",
        {source: "docs"},
      ),
      0.78,
    ),
  ],
});
```

## MMR diversity selection

Enable MMR to reduce redundant packets in the selected context:

```ts
const builder = new ContextBuilder({
  config: {
    enableMmr: true,
    mmrLambda: 0.6,   // 0 = pure diversity, 1 = pure relevance
    maxTokens: 4096,
  },
});
```

MMR score formula:
```
mmrScore = λ × composite(p) - (1-λ) × max_sim(p, selected)
```

## Recency time-decay scoring

Packets with a `timestamp` field are scored by how recent they are:

```ts
const builder = new ContextBuilder({
  config: {
    enableMmr: true,
    recencyWeight: 0.3,       // 30% recency, 70% relevance
    recencyTau: 1_800_000,    // decay time scale: 30 minutes (ms)
  },
});

const result = await builder.build({
  userQuery: "Latest status?",
  additionalPackets: [
    {
      content: "Task completed successfully.",
      metadata: {},
      relevanceScore: 0.85,
      timestamp: Date.now() - 30_000,    // 30s ago → high recency
    },
    {
      content: "Task was started this morning.",
      metadata: {},
      relevanceScore: 0.80,
      timestamp: Date.now() - 7_200_000, // 2h ago → low recency
    },
  ],
});
```

Composite score:
```
composite = (1 - recencyWeight) × relevance + recencyWeight × exp(-Δt / recencyTau)
```

## Semantic similarity with embedders

### Using `@agenticforge/memory` embedder (recommended)

```ts
import {createDefaultTextEmbedder} from "@agenticforge/memory";
import {ContextBuilder} from "@agenticforge/context";

// Auto-detects EMBEDDING_* env vars; falls back to hash embedder
const builder = new ContextBuilder({
  config: {
    enableMmr: true,
    memoryEmbedder: createDefaultTextEmbedder(),
  },
});
```

### Using a custom OpenAI embedder

```ts
const builder = new ContextBuilder({
  config: {
    enableMmr: true,
    embedder: async (texts) => {
      const res = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: texts,
      });
      return res.data.map(d => d.embedding);
    },
  },
});
```

### Similarity priority chain

```
explicit embedder
  → memoryEmbedder (auto-adapted)
    → TF-IDF weighted bag-of-words (local, zero latency)
      → auto-fallback on embedder error
```

## Token budget control

```ts
const builder = new ContextBuilder({
  config: {
    maxTokens: 8192,
    systemTokenBudget: 512,   // reserved for system instructions
    historyTokenBudget: 2048, // max tokens for conversation history
    minRelevance: 0.3,        // filter packets below this score
  },
});
```

History is filled from newest to oldest; packets are ranked by composite score and filled greedily (or via MMR) until budget is exhausted.

## Configuration reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxTokens` | `number` | `4096` | Total token budget |
| `enableMmr` | `boolean` | `false` | Enable MMR diversity selection |
| `mmrLambda` | `number` | `0.5` | MMR λ (0=diversity, 1=relevance) |
| `minRelevance` | `number` | `0` | Minimum relevance score to include |
| `recencyWeight` | `number` | `0.3` | Weight of recency in composite score |
| `recencyTau` | `number` | `3600000` | Recency decay time scale (ms) |
| `embedder` | `TextEmbedder` | — | Custom dense vector embedder |
| `memoryEmbedder` | `MemoryEmbedderLike` | — | `@agenticforge/memory` embedder |
| `systemTokenBudget` | `number` | `512` | Token cap for system instructions |
| `historyTokenBudget` | `number` | `1024` | Token cap for conversation history |
| `tokenCounter` | `TokenCounter` | — | Custom token counting function |
