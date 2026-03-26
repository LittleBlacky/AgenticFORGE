# @agenticforge/utils

[![npm](https://img.shields.io/npm/v/@agenticforge/utils)](https://www.npmjs.com/package/@agenticforge/utils)

AgenticFORGE 通用工具包 — LRU 缓存与 Prompt 工具。

## 安装

```bash
npm install @agenticforge/utils
```

## LRUCache

```ts
import {LRUCache} from "@agenticforge/utils";

const cache = new LRUCache<string, number[]>({maxSize: 512});

cache.set("embedding:hello", [0.1, 0.2, 0.3]);
const vec = cache.get("embedding:hello");

console.log(cache.size);  // 1
```
