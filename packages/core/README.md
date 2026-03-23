# @agenticforge/core

[![npm](https://img.shields.io/npm/v/@agenticforge/core)](https://www.npmjs.com/package/@agenticforge/core)
[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)


<p><a href="./README.zh_CN.md">中文</a> | <strong>English</strong></p>

Core package for AgenticFORGE ?base types, LLM client abstraction, and message structures.

## Installation

```bash
npm install @agenticforge/core
```

## Exports

| Name | Description |
|------|-------------|
| `LLMClient` | Unified LLM client supporting OpenAI and compatible providers |
| `Agent` | Base class for all agents, with hook lifecycle support |
| `Message` | Message type: `system` / `user` / `assistant` / `tool` |
| `Config` | Shared agent configuration object |
| `createConsoleLoggingHook` | Built-in logging hook factory |
| `MetricsHook` | Built-in metrics collector hook |

## Hooks Quick Example

```ts
import {
  Agent,
  createConsoleLoggingHook,
  MetricsHook,
} from "@agenticforge/core";

const metrics = new MetricsHook();
agent
  .useHook(createConsoleLoggingHook({events: ["afterRun", "onError"]}))
  .useHook(metrics.hook);

// ... run agent ...
console.log(metrics.getSnapshot());
```

## Usage

```ts
import {LLMClient} from "@agenticforge/core";

const llm = new LLMClient({
  provider: "openai",
  model: "gpt-4o",
  apiKey: process.env.OPENAI_API_KEY,
});

const response = await llm.chat([
  {role: "user", content: "Hello, introduce yourself."},
]);

console.log(response.content);
```

## Links

- [GitHub](https://github.com/LittleBlacky/AgenticFORGE/tree/main/packages/core)
- [npm](https://www.npmjs.com/package/@agenticforge/core)
- [Root README](https://github.com/LittleBlacky/AgenticFORGE)
