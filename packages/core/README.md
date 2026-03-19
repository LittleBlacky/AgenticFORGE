# @agenticforge/core

[![npm](https://img.shields.io/npm/v/@agenticforge/core)](https://www.npmjs.com/package/@agenticforge/core)
[![license](https://img.shields.io/github/license/LittleBlacky/AgenticFORGE)](https://github.com/LittleBlacky/AgenticFORGE/blob/main/LICENSE)

<p><a href="./README.zh_CN.md">中文</a> | <strong>English</strong></p>

Core package for AgenticFORGE �?base types, LLM client abstraction, and message structures.

## Installation

```bash
npm install @agenticforge/core
```

## Exports

| Name | Description |
|------|-------------|
| `LLMClient` | Unified LLM client supporting OpenAI and compatible providers |
| `BaseAgent` | Base class for all agents, defines the lifecycle interface |
| `Message` | Message type �?`system` / `user` / `assistant` / `tool` |
| `AgentConfig` | Shared agent configuration type |

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
