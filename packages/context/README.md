# @agenticforge/context

[![npm](https://img.shields.io/npm/v/@agenticforge/context)](https://www.npmjs.com/package/@agenticforge/context)
[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)


<p><a href="./README.zh_CN.md">中文</a> | <strong>English</strong></p>

Token-aware context builder for precise LLM input window management.

## Installation

```bash
npm install @agenticforge/context
```

## Exports

| Name | Description |
|------|-------------|
| `ContextBuilder` | Assembles messages by priority within a token budget |
| `estimateTokens` | Estimates token count for a string or message array |
| `createTokenCounter` | Creates a reusable token counter instance |

## Usage

```ts
import {ContextBuilder, estimateTokens} from "@agenticforge/context";

const builder = new ContextBuilder({maxTokens: 4096});

builder.addSystemPrompt("You are a professional code assistant.");
builder.addHistory(conversationHistory);
builder.addUserMessage("Please optimize this function.");

const context = builder.build();
console.log(`Token usage: ${estimateTokens(context)}`);
```

## Links

- [GitHub](https://github.com/LittleBlacky/AgenticFORGE/tree/main/packages/context)
- [npm](https://www.npmjs.com/package/@agenticforge/context)
- [Root README](https://github.com/LittleBlacky/AgenticFORGE)
