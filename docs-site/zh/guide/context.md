# 上下文构建器

`ContextBuilder` 在 Token 预算内组装 LLM 消息，当超出限制时自动裁剪历史记录。

## 基础用法

```ts
import {ContextBuilder, estimateTokens} from "@agenticforge/context";

const builder = new ContextBuilder({maxTokens: 4096});

builder.addSystemPrompt("你是一个专业的代码助手。");
builder.addHistory(conversationHistory); // 超出预算时从最旧的记录开始裁剪
builder.addUserMessage("帮我重构这个函数以提高可读性。");

const messages = builder.build();
console.log(`Token 用量：${estimateTokens(messages)}`);

const response = await llm.chat(messages);
```

## 优先级裁剪规则

Token 预算不足时，按以下优先级保留消息：

1. 系统提示词 — **始终保留**
2. 用户消息 — **始终保留**
3. 历史记录 — **从最旧的开始裁剪**

```ts
const builder = new ContextBuilder({maxTokens: 2048});

builder.addSystemPrompt("你是一个有帮助的助手。"); // 优先级：高
builder.addHistory(veryLongHistory);               // 超出时自动裁剪
builder.addUserMessage("总结我们的对话。");         // 优先级：高

const trimmed = builder.build();
// 历史记录被自动裁剪至 2048 Token 以内
```

## Token 估算

```ts
import {estimateTokens, createTokenCounter} from "@agenticforge/context";

// 快速估算
const count = estimateTokens("你好，世界！");

// 可复用的计数器实例
const counter = createTokenCounter();
const count2 = counter.count(messages);
```
