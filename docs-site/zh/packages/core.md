# @agenticforge/core

[![npm](https://img.shields.io/npm/v/@agenticforge/core)](https://www.npmjs.com/package/@agenticforge/core)

核心包 — 基础类型、LLM 客户端抽象与消息结构。

## 安装

```bash
npm install @agenticforge/core
```

## 主要导出

| 名称 | 说明 |
|------|------|
| `LLMClient` | 统一 LLM 客户端，支持 OpenAI 等 provider |
| `BaseAgent` | 所有 Agent 的基类 |
| `Message` | 消息类型（system / user / assistant / tool）|
| `AgentConfig` | Agent 通用配置类型 |

## 使用示例

```ts
import {LLMClient} from "@agenticforge/core";

const llm = new LLMClient({
  provider: "openai",
  model: "gpt-4o",
  apiKey: process.env.OPENAI_API_KEY,
});

const response = await llm.chat([
  {role: "user", content: "你好，介绍一下自己。"},
]);
console.log(response.content);
```
