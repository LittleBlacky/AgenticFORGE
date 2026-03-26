# 快速开始

60 秒内让 Agent 跑起来。

## 1. 安装

```bash
npm install @agenticforge/kit
# 或
pnpm add @agenticforge/kit
```

> 工具参数校验还需要 `zod`：
> ```bash
> npm install zod
> ```

## 2. 配置 API Key

```bash
export OPENAI_API_KEY=sk-...
```

或创建 `.env` 文件：

```
OPENAI_API_KEY=sk-...
```

## 3. 创建第一个 Agent

```ts
import {FunctionCallAgent, LLMClient, Tool, toolAction} from "@agenticforge/kit";
import {z} from "zod";

// 1. 定义工具
const weatherTool = new Tool({
  name: "get_weather",
  description: "获取指定城市的当前天气",
  parameters: [
    {name: "city", type: "string", description: "城市名称", required: true},
  ],
  action: toolAction(z.object({city: z.string()}), async ({city}) => {
    // 替换为真实的天气 API 调用
    return `${city}：晴，25°C`;
  }),
});

// 2. 创建 LLM 客户端
const llm = new LLMClient({
  provider: "openai",
  model: "gpt-4o",
  apiKey: process.env.OPENAI_API_KEY,
});

// 3. 创建并运行 Agent
const agent = new FunctionCallAgent({llm, tools: [weatherTool]});
const result = await agent.run("东京和伦敦今天天气怎么样？");
console.log(result);
```

## 4. 加入记忆系统

```ts
import {MemoryManager} from "@agenticforge/memory/manager";

const memory = new MemoryManager({
  enableWorking: true,
  enableSemantic: true,
});

await memory.addMemory({
  content: "用户偏好：回复用要点列表形式",
  memoryType: "semantic",
  importance: 0.9,
});

const context = await memory.retrieveMemories({
  query: "用户偏好",
  limit: 3,
});
```

## 下一步

- [Agent 指南](/zh/guide/agents) — 了解各种 Agent 的适用场景
- [记忆系统](/zh/guide/memory) — 持久化记忆与向量存储
- [RAG 流水线](/zh/guide/rag) — 文档索引与语义问答
- [内置工具](/zh/packages/tools-builtin) — 搜索、笔记、RAG 工具、终端
