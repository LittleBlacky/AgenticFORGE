# Context Builder

The `ContextBuilder` assembles LLM messages within a token budget, automatically trimming history when the limit is reached.

## Basic usage

```ts
import {ContextBuilder, estimateTokens} from "@agenticforge/context";

const builder = new ContextBuilder({maxTokens: 4096});

builder.addSystemPrompt("You are a professional code assistant.");
builder.addHistory(conversationHistory); // trimmed from oldest if needed
builder.addUserMessage("Refactor this function for readability.");

const messages = builder.build();
console.log(`Token usage: ${estimateTokens(messages)}`);

const response = await llm.chat(messages);
```

## Priority-based trimming

When the token budget is tight, messages are trimmed by priority:

1. System prompt — **always preserved**
2. User message — **always preserved**
3. History — **trimmed oldest first**

```ts
const builder = new ContextBuilder({maxTokens: 2048});

builder.addSystemPrompt("You are a helpful assistant."); // priority: high
builder.addHistory(veryLongHistory);                      // trimmed if needed
builder.addUserMessage("Summarize our conversation.");    // priority: high

const trimmed = builder.build();
// History is automatically trimmed to fit within 2048 tokens
```

## Token estimation

```ts
import {estimateTokens, createTokenCounter} from "@agenticforge/context";

// Quick estimate
const count = estimateTokens("Hello, world!");

// Reusable counter instance
const counter = createTokenCounter();
const count2 = counter.count(messages);
```
