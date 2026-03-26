# @agenticforge/context

[![npm](https://img.shields.io/npm/v/@agenticforge/context)](https://www.npmjs.com/package/@agenticforge/context)

Token 感知的上下文构建器，支持 MMR 多样性选择、TF-IDF / 稠密向量相似度、新近性时间衰减评分。

## 安装

```bash
npm install @agenticforge/context
```

## 导出列表

| 名称 | 说明 |
|------|------|
| `ContextBuilder` | 在 token 预算内组装消息 |
| `ContextPacketBuilder` | 创建和标注 context packet 的辅助类 |
| `fromMemoryEmbedder` | 将 `@agenticforge/memory` embedder 适配为 `TextEmbedder` |
| `estimateTokens` | 快速 token 数量估算 |
| `Tokenizer` | 基于 `js-tiktoken` 的可复用 tokenizer |
| `TextEmbedder` | 类型：`(texts: string[]) => Promise<number[][]>` |
| `MemoryEmbedderLike` | 与 `@agenticforge/memory` embedder 兼容的接口 |
| `ContextBuilderConfig` | 完整配置接口 |
| `ContextPacket` | Packet 类型（content + metadata + relevanceScore + timestamp） |
| `BuiltContext` | `builder.build()` 的返回类型 |

详见 [上下文构建器指南](/zh/guide/context)。
