# @agenticforge/kit

[![npm](https://img.shields.io/npm/v/@agenticforge/kit)](https://www.npmjs.com/package/@agenticforge/kit)
[![license](https://img.shields.io/github/license/LittleBlacky/AgenticFORGE)](https://github.com/LittleBlacky/AgenticFORGE/blob/main/LICENSE)

<p><strong>中文</strong> | <a href="./README.md">English</a></p>

AgenticFORGE 一站式入口包，聚合所有子包的导出，一行安装即可使用框架全部能力。

## 安装

```bash
npm install @agenticforge/kit
# or
pnpm add @agenticforge/kit
```

## 包含内容

| 包 | 说明 |
|----|------|
| `@agenticforge/core` | 核心类型、LLM 客户端 |
| `@agenticforge/tools` | Tool 抽象、Registry、Chain |
| `@agenticforge/agents` | ReAct / Plan-Solve / Reflection / FunctionCall / Simple |
| `@agenticforge/memory` | 多类型记忆管理器、RAG、存储适配层 |
| `@agenticforge/tools-builtin` | 内置工具集 |
| `@agenticforge/context` | Token 感知上下文构建器 |
| `@agenticforge/utils` | 通用工具 |

## 使用示例

```ts
import {
  LLMClient,
  FunctionCallAgent,
  Tool,
  toolAction,
  SearchTool,
} from "@agenticforge/kit";
import {z} from "zod";

const agent = new FunctionCallAgent({
  llm: new LLMClient({provider: "openai", model: "gpt-4o"}),
  tools: [new SearchTool()],
});

const result = await agent.run("搜索 AgenticFORGE 最新动态。");
console.log(result);
```

## 链接

- [GitHub](https://github.com/LittleBlacky/AgenticFORGE/tree/main/packages/kit)
- [npm](https://www.npmjs.com/package/@agenticforge/kit)
- [主项目 README](https://github.com/LittleBlacky/AgenticFORGE)
