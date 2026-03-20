---
name: agenticforge-context
description: Expert at using AgenticFORGE ContextBuilder to manage LLM token budgets. Use when the user needs to control token usage, prevent context overflow, or build messages that fit within a model window.
triggerHint: When the user asks about token limits, context window, message truncation, prompt assembly, or fitting history into a model context.
---

# AgenticFORGE ContextBuilder Expert

## Role
You are an expert in `@agenticforge/context`. You ensure LLM calls never exceed context windows by building token-aware message arrays.

## Constructor

`ContextBuilder` takes a `config` object nested inside an options object:

```typescript
import { ContextBuilder } from "@agenticforge/context";

const ctx = new ContextBuilder({
  config: {
    maxTokens: 4096,
    systemTokenBudget: 512,
    historyTokenBudget: 1024,
    minRelevance: 0,
  },
});
```

**Note:** The constructor signature is `new ContextBuilder({ config?: ContextBuilderConfig })`,
not `new ContextBuilder({ maxTokens })` directly.

## Basic Usage

```typescript
import { ContextBuilder } from "@agenticforge/context";
import type { Message } from "@agenticforge/context";

const ctx = new ContextBuilder({ config: { maxTokens: 4096 } });

const history: Message[] = [
  { role: "user",      content: "What is RAG?" },
  { role: "assistant", content: "RAG stands for Retrieval-Augmented Generation..." },
];

const built = await ctx.build({
  userQuery: "Give me a code example.",
  systemInstructions: "You are a helpful assistant.",
  conversationHistory: history,
});

// built.messages: Message[]  — ready to send to LLM
// built.system: string       — system instructions text
// built.totalTokens: number  — estimated tokens used
// built.truncated: boolean   — true if structured context was truncated

const output = await llm.think(built.messages);
```

## With RAG context (additionalPackets)

```typescript
import { ContextBuilder, type ContextPacket } from "@agenticforge/context";

const ragResults = await rag.retrieve(userQuery, { topK: 5 });
const packets: ContextPacket[] = ragResults.map((r) => ({
  content: r.content,
  metadata: { source: r.metadata?.source },
  relevanceScore: r.score ?? 0.8,
  type: "retrieval",
}));

const ctx = new ContextBuilder({ config: { maxTokens: 8192 } });
const built = await ctx.build({
  userQuery,
  systemInstructions: "You are a helpful assistant.",
  conversationHistory: history,
  additionalPackets: packets,
});

const output = await llm.think(built.messages);
```

## Token budget pattern

```typescript
const TOTAL = 8192;
const RESERVED_OUTPUT = 1500;

const ctx = new ContextBuilder({
  config: {
    maxTokens: TOTAL - RESERVED_OUTPUT,
    historyTokenBudget: 2048,
    systemTokenBudget: 512,
  },
});
```

## ContextBuilderConfig reference

| Option | Default | Notes |
|---|---|---|
| `maxTokens` | 4096 | Total token budget |
| `systemTokenBudget` | 512 | Max tokens for `systemInstructions` |
| `historyTokenBudget` | 1024 | Max tokens for `conversationHistory` |
| `minRelevance` | 0 | Min `relevanceScore` for `additionalPackets` |
| `enableMmr` | false | Use MMR diversity selection for packets |
| `mmrLambda` | 0.5 | MMR relevance/diversity tradeoff |
| `recencyWeight` | 0.3 | Weight for recency in composite packet score |
| `enableStructuredTemplate` | false | Render packets into structured sections |
| `enableCompression` | true | Truncate structured template if over budget |

## BuildContextInput reference

| Field | Type | Notes |
|---|---|---|
| `userQuery` | `string` | Required. Never trimmed. |
| `systemInstructions` | `string?` | Optional system prompt. Never trimmed. |
| `conversationHistory` | `Message[]?` | Trimmed oldest-first if over budget. |
| `additionalPackets` | `ContextPacket[]?` | RAG/tool results, selected by relevance + recency. |

## BuiltContext result shape

```typescript
interface BuiltContext {
  system: string;
  messages: Message[];       // history + user message — ready to send
  totalTokens: number;
  includedPackets: ContextPacket[];
  truncated: boolean;
  structuredSystem?: string; // only set when enableStructuredTemplate: true
}
```

## Model reference

| Model | Window | Safe maxTokens |
|---|---|---|
| gpt-4o | 128k | 100000 |
| gpt-4o-mini | 128k | 100000 |
| gpt-3.5-turbo | 16k | 14000 |

## Gotchas

- Constructor is `new ContextBuilder({ config: { maxTokens } })` — NOT `new ContextBuilder({ maxTokens })`
- There are NO `addSystem()`, `addHistory()`, `addUser()` methods — everything goes into `build({ ... })`
- `build()` is **async** — always `await ctx.build({ userQuery, ... })`
- `systemInstructions` is NEVER trimmed — keep it concise
- `userQuery` is NEVER trimmed — always included
- History is trimmed oldest-first — recent context preserved
- Token counting uses approximation (chars/4) — actual model tokenization may differ

## Output Format

1. Show ContextBuilder with correct constructor `{ config: { maxTokens } }` for target model
2. Wire `built.messages` into the LLM call
3. Warn if system prompt or RAG context risks consuming too many tokens
