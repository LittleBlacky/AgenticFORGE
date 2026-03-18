# @agenticforge/context

[![npm](https://img.shields.io/npm/v/@agenticforge/context)](https://www.npmjs.com/package/@agenticforge/context)
[![license](https://img.shields.io/github/license/LittleBlacky/AgenticFORGE)](https://github.com/LittleBlacky/AgenticFORGE/blob/main/LICENSE)

<p><strong>中文</strong> | <a href="./README.md">English</a></p>

AgenticFORGE 上下文管理包，提供 Token 感知的上下文构建器，精准控制发送给 LLM 的输入窗口。

## 安装

```bash
npm install @agenticforge/context
```

## 主要导出

| 名称 | 说明 |
|------|------|
| `ContextBuilder` | 上下文构建器，按优先级与 Token 预算组装消息 |
| `estimateTokens` | Token 数量估算函数 |
| `createTokenCounter` | 创建 Token 计数器实例 |

## 使用示例

```ts
import {ContextBuilder, estimateTokens} from "@agenticforge/context";

const builder = new ContextBuilder({maxTokens: 4096});

builder.addSystemPrompt("你是一个专业的代码助手");
builder.addHistory(conversationHistory);
builder.addUserMessage("帮我优化这段代码");

const context = builder.build();
console.log(`Token 用量: ${estimateTokens(context)}`);
```

## 链接

- [GitHub](https://github.com/LittleBlacky/AgenticFORGE/tree/main/packages/context)
- [npm](https://www.npmjs.com/package/@agenticforge/context)
- [主项目 README](https://github.com/LittleBlacky/AgenticFORGE)
