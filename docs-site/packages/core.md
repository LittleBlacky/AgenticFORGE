# @agenticforge/core

[![npm](https://img.shields.io/npm/v/@agenticforge/core)](https://www.npmjs.com/package/@agenticforge/core)

Core types, LLM client abstraction, and message structures for AgenticFORGE.

## Installation

```bash
npm install @agenticforge/core
```

## Exports

| Name | Description |
|------|-------------|
| `LLMClient` | Unified LLM client supporting OpenAI and compatible providers |
| `BaseAgent` | Base class for all agents |
| `Message` | Message type — `system` / `user` / `assistant` / `tool` |
| `AgentConfig` | Shared agent configuration type |

## LLMClient

```ts
import {LLMClient} from "@agenticforge/core";

const llm = new LLMClient({
  provider: "openai",
  model: "gpt-4o",
  apiKey: process.env.OPENAI_API_KEY,
});

// Single-turn
const response = await llm.chat([
  {role: "user", content: "Explain RAG in one sentence."},
]);
console.log(response.content);

// With system prompt
const response2 = await llm.chat([
  {role: "system", content: "You are a concise technical writer."},
  {role: "user", content: "What is a vector database?"},
]);

// Streaming
for await (const chunk of llm.stream(messages)) {
  process.stdout.write(chunk);
}
```
