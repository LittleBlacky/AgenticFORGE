# @agenticforge/core

[![npm](https://img.shields.io/npm/v/@agenticforge/core)](https://www.npmjs.com/package/@agenticforge/core)
[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)


<p><strong>中文</strong> | <a href="./README.md">English</a></p>

AgenticFORGE 核心包，提供基础类型定义、LLM 客户端抽象与消息结构。

## 安装

```bash
npm install @agenticforge/core
```

## 主要导出

| 名称 | 说明 |
|------|------|
| `LLMClient` | 统一的 LLM 调用客户端，支持 OpenAI 等 provider |
| `Agent` | 所有 Agent 的基类，内置 Hook 生命周期能力 |
| `Message` | 消息类型（system / user / assistant / tool）|
| `Config` | Agent 通用配置对象 |
| `createConsoleLoggingHook` | 内置日志 Hook 工厂 |
| `MetricsHook` | 内置指标统计 Hook |

## Hooks 快速示例

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

// ... 执行 agent ...
console.log(metrics.getSnapshot());
```

## 使用示例

```ts
import {LLMClient} from "@agenticforge/core";

const llm = new LLMClient({
  provider: "openai",
  model: "gpt-4o",
  apiKey: process.env.OPENAI_API_KEY,
});

const response = await llm.chat([
  {role: "user", content: "你好，介绍一下自己"},
]);

console.log(response.content);
```

## 链接

- [GitHub](https://github.com/LittleBlacky/AgenticFORGE/tree/main/packages/core)
- [npm](https://www.npmjs.com/package/@agenticforge/core)
- [主项目 README](https://github.com/LittleBlacky/AgenticFORGE)
