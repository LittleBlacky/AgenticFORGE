# @agenticforge/context

[![npm](https://img.shields.io/npm/v/@agenticforge/context)](https://www.npmjs.com/package/@agenticforge/context)
[![license](https://img.shields.io/github/license/LittleBlacky/AgenticFORGE)](https://github.com/LittleBlacky/AgenticFORGE/blob/main/LICENSE)

Token-aware context builder for precise LLM input window management.

## Installation

```bash
npm install @agenticforge/context
```

## Exports

| Name | Description |
|------|-------------|
| `ContextBuilder` | Assembles messages by priority within a token budget |
| `ContextPacketBuilder` | Builds structured context packets |
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

// Pass to LLM
const response = await llm.chat(context);
```

### Token budget enforcement

```ts
const builder = new ContextBuilder({maxTokens: 2048});

// Higher-priority items are preserved when the budget is tight.
// History is trimmed from oldest to newest automatically.
builder.addSystemPrompt("You are a helpful assistant."); // priority: high
builder.addHistory(longHistory);                          // trimmed if needed
builder.addUserMessage(userInput);                        // always included

const trimmed = builder.build();
```

## Links

- [GitHub](https://github.com/LittleBlacky/AgenticFORGE/tree/main/packages/context)
- [npm](https://www.npmjs.com/package/@agenticforge/context)
- [Root README](https://github.com/LittleBlacky/AgenticFORGE)
