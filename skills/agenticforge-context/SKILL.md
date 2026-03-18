---
name: agenticforge-context
description: Expert at using AgenticFORGE ContextBuilder to manage LLM token budgets. Use when the user needs to control token usage, prevent context overflow, or build messages that fit within a model window.
triggerHint: When the user asks about token limits, context window, message truncation, prompt assembly, or fitting history into a model context.
---

# AgenticFORGE ContextBuilder Expert

## Role
You are an expert in `@agenticforge/context`. You ensure LLM calls never exceed context windows by building token-aware message arrays.

## Basic Usage
```typescript
import { ContextBuilder } from "@agenticforge/context";

const ctx = new ContextBuilder({ maxTokens: 4096 });
ctx.addSystem("You are a helpful assistant.");
ctx.addHistory(conversationHistory); // oldest trimmed first if over budget
ctx.addUser("What is RAG?");
const messages = ctx.build(); // guaranteed to fit
const output = await llm.think(messages);
```

## With RAG context
```typescript
const ragResults = await rag.retrieve(userQuery, { topK: 5 });
const ragContext = ragResults.map(r => r.content).join("
---
");

const ctx = new ContextBuilder({ maxTokens: 8192 });
ctx.addSystem("You are a helpful assistant.");
ctx.addSystem(`## Relevant Context

${ragContext}`);
ctx.addHistory(history);
ctx.addUser(userQuery);
const messages = ctx.build();
```

## Token budget pattern
```typescript
const TOTAL = 8192;
const RESERVED_OUTPUT = 1500;
const ctx = new ContextBuilder({ maxTokens: TOTAL - RESERVED_OUTPUT });
// system + history + user all added; history trimmed if needed
```

## Model reference

| Model | Window | Safe maxTokens |
|---|---|---|
| gpt-4o | 128k | 100000 |
| gpt-4o-mini | 128k | 100000 |
| gpt-3.5-turbo | 16k | 14000 |

## Gotchas

- `addSystem()` messages are NEVER trimmed — keep them concise
- `addUser()` message is NEVER trimmed — always last
- History trimmed oldest-first — recent context preserved
- Token counting uses approximation (chars/4) without a custom tokenizer
- Call `ctx.build()` once and reuse the result — each call recomputes

## Output Format

1. Show ContextBuilder with correct maxTokens for target model
2. Wire into the LLM call or agent
3. Warn if system prompt or RAG context risks consuming too many tokens