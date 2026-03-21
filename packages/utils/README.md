# @agenticforge/utils

[![npm](https://img.shields.io/npm/v/@agenticforge/utils)](https://www.npmjs.com/package/@agenticforge/utils)
[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)


<p><a href="./README.zh_CN.md">中文</a> | <strong>English</strong></p>

Utility helpers for AgenticFORGE �?LRU cache, prompt utilities, and more.

## Installation

```bash
npm install @agenticforge/utils
```

## Exports

| Name | Description |
|------|-------------|
| `LRUCache` | High-performance LRU cache for tool results, embeddings, and more |
| `Prompt` | Prompt template utility with variable interpolation |

## Usage

```ts
import {LRUCache} from "@agenticforge/utils";

const cache = new LRUCache<string, string>({maxSize: 100});

cache.set("key1", "value1");
const val = cache.get("key1");
console.log(val); // "value1"
```

## Links

- [GitHub](https://github.com/LittleBlacky/AgenticFORGE/tree/main/packages/utils)
- [npm](https://www.npmjs.com/package/@agenticforge/utils)
- [Root README](https://github.com/LittleBlacky/AgenticFORGE)
