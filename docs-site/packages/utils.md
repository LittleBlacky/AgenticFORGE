# @agenticforge/utils

[![npm](https://img.shields.io/npm/v/@agenticforge/utils)](https://www.npmjs.com/package/@agenticforge/utils)

Utility helpers for AgenticFORGE — LRU cache and prompt utilities.

## Installation

```bash
npm install @agenticforge/utils
```

## Exports

| Name | Description |
|------|-------------|
| `LRUCache` | High-performance LRU cache |
| `Prompt` | Prompt template with variable interpolation |

## LRUCache

```ts
import {LRUCache} from "@agenticforge/utils";

const cache = new LRUCache<string, number[]>({maxSize: 512});

cache.set("embedding:hello", [0.1, 0.2, 0.3]);
const vec = cache.get("embedding:hello");

console.log(cache.size);  // 1
console.log(cache.has("embedding:hello")); // true
```
