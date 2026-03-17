# @agenticforge/kit

[![npm](https://img.shields.io/npm/v/@agenticforge/kit)](https://www.npmjs.com/package/@agenticforge/kit)
[![license](https://img.shields.io/github/license/LittleBlacky/AgenticFORGE)](https://github.com/LittleBlacky/AgenticFORGE/blob/main/LICENSE)

AgenticFORGE 一站式入口包，聚合所有子包的导出，一行安装即可使用框架全部能力。

> All-in-one entry point for AgenticFORGE — install once, use everything.

## 安装

```bash
npm install @agenticforge/kit
# or
pnpm add @agenticforge/kit
```

## 包含内容

`@agenticforge/kit` 聚合了以下所有包的导出：

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
  MemoryManager,
  ContextBuilder,
} from "@agenticforge/kit";
import {z} from "zod";

// 创建 LLM 客户端
const llm = new LLMClient({provider: "openai", model: "gpt-4o"});

// 定义工具
const greetTool = new Tool({
  name: "greet",
  description: "向用户打招呼",
  parameters: [{name: "name", type: "string", description: "用户名", required: true}],
  action: toolAction(z.object({name: z.string()}), async ({name}) => {
    return `你好，${name}！`;
  }),
});

// 创建 Agent
const agent = new FunctionCallAgent({llm, tools: [greetTool]});
const result = await agent.run("帮我向 Alice 打个招呼");
console.log(result);
```

## 链接

- [GitHub](https://github.com/LittleBlacky/AgenticFORGE/tree/main/packages/kit)
- [npm](https://www.npmjs.com/package/@agenticforge/kit)
- [主项目 README](https://github.com/LittleBlacky/AgenticFORGE)
