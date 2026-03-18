# @agenticforge/utils

[![npm](https://img.shields.io/npm/v/@agenticforge/utils)](https://www.npmjs.com/package/@agenticforge/utils)
[![license](https://img.shields.io/github/license/LittleBlacky/AgenticFORGE)](https://github.com/LittleBlacky/AgenticFORGE/blob/main/LICENSE)

<p><strong>中文</strong> | <a href="./README.md">English</a></p>

AgenticFORGE 通用工具包，提供 LRU 缓存、Prompt 工具等基础设施。

## 安装

```bash
npm install @agenticforge/utils
```

## 主要导出

| 名称 | 说明 |
|------|------|
| `LRUCache` | 高性能 LRU 缓存，用于工具结果、嵌入向量等缓存场景 |
| `Prompt` | Prompt 模板工具，支持变量插值 |

## 使用示例

```ts
import {LRUCache} from "@agenticforge/utils";

const cache = new LRUCache<string, string>({maxSize: 100});

cache.set("key1", "value1");
const val = cache.get("key1");
console.log(val); // "value1"
```

## 链接

- [GitHub](https://github.com/LittleBlacky/AgenticFORGE/tree/main/packages/utils)
- [npm](https://www.npmjs.com/package/@agenticforge/utils)
- [主项目 README](https://github.com/LittleBlacky/AgenticFORGE)
