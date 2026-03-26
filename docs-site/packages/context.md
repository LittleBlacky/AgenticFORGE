# @agenticforge/context

[![npm](https://img.shields.io/npm/v/@agenticforge/context)](https://www.npmjs.com/package/@agenticforge/context)

Token-aware context builder for precise LLM input window management, with MMR diversity selection, TF-IDF / dense-vector similarity, and recency time-decay scoring.

## Installation

```bash
npm install @agenticforge/context
```

## Exports

| Name | Description |
|------|-------------|
| `ContextBuilder` | Assembles messages within a token budget |
| `ContextPacketBuilder` | Helper to create and annotate context packets |
| `fromMemoryEmbedder` | Adapts a `@agenticforge/memory` embedder for use in `ContextBuilder` |
| `estimateTokens` | Quick token count estimate |
| `Tokenizer` | Reusable tokenizer backed by `js-tiktoken` |
| `TextEmbedder` | Type: `(texts: string[]) => Promise<number[][]>` |
| `MemoryEmbedderLike` | Interface compatible with `@agenticforge/memory` embedders |
| `ContextBuilderConfig` | Full configuration interface |
| `ContextPacket` | Packet type (content + metadata + relevanceScore + timestamp) |
| `BuiltContext` | Return type of `builder.build()` |

See the [Context Builder Guide](/guide/context) for detailed usage.
