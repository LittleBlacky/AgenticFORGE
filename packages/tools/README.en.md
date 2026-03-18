# @agenticforge/tools

[![npm](https://img.shields.io/npm/v/@agenticforge/tools)](https://www.npmjs.com/package/@agenticforge/tools)
[![license](https://img.shields.io/github/license/LittleBlacky/AgenticFORGE)](https://github.com/LittleBlacky/AgenticFORGE/blob/main/LICENSE)

<p><strong>中文</strong> | <a href="./README.md">English</a></p>

AgenticFORGE 工具核心包，提供 Tool 抽象、ToolRegistry、ToolChain 与异步执行器。

## 安装

```bash
npm install @agenticforge/tools
```

## 主要导出

| 名称 | 说明 |
|------|------|
| `Tool` | 工具基类，封装参数定义与执行逻辑 |
| `toolAction` | 工具动作工厂，结合 Zod 做参数校验 |
| `ToolRegistry` | 工具注册表，统一管理可用工具 |
| `ToolChain` | 工具链，支持顺序/并行组合多个工具 |
| `AsyncToolExecutor` | 异步工具执行器，支持超时与并发控制 |

## 使用示例

```ts
import {Tool, toolAction, ToolRegistry} from "@agenticforge/tools";
import {z} from "zod";

const searchTool = new Tool({
  name: "search",
  description: "搜索互联网信息",
  parameters: [
    {name: "query", type: "string", description: "搜索关键词", required: true},
  ],
  action: toolAction(z.object({query: z.string()}), async ({query}) => {
    return `搜索结果：${query} 相关内容...`;
  }),
});

const registry = new ToolRegistry();
registry.register(searchTool);

const tool = registry.get("search");
const result = await tool.execute({query: "AgenticFORGE"});
console.log(result);
```

## 链接

- [GitHub](https://github.com/LittleBlacky/AgenticFORGE/tree/main/packages/tools)
- [npm](https://www.npmjs.com/package/@agenticforge/tools)
- [主项目 README](https://github.com/LittleBlacky/AgenticFORGE)
