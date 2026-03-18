<p align="center">
  <img src="assets/LOGO.png" alt="AgenticFORGE" width="200" />
</p>

<h1 align="center">AgenticFORGE</h1>

<h3 align="center">以工具调用为核心�?TypeScript Agent 框架</h3>

<p align="center">
  <a href="https://www.npmjs.com/package/@agenticforge/kit"><img src="https://img.shields.io/npm/v/@agenticforge/kit?label=%40agenticforge%2Fkit" alt="npm version" /></a>
  <a href="https://github.com/LittleBlacky/AgenticFORGE/blob/main/LICENSE"><img src="https://img.shields.io/github/license/LittleBlacky/AgenticFORGE" alt="license" /></a>
  <a href="https://github.com/LittleBlacky/AgenticFORGE"><img src="https://img.shields.io/github/stars/LittleBlacky/AgenticFORGE?style=social" alt="stars" /></a>
</p>

<p align="center">
  <strong>中文</strong> | <a href="./README.md">English</a>
</p>

---

## 简�?

AgenticFORGE 是一个面�?Agent 开发的 TypeScript 框架，以**工具调用**为核心驱动力，内置多种经�?Agent 工作流（ReAct、Plan-and-Solve、Reflection、FunctionCall），并提供可插拔的多层记忆系统与 RAG 流水线�?

---

## 核心特�?

- **工具驱动**：统一�?`Tool` / `ToolRegistry` / `ToolChain` 抽象，支持同步与异步工具、参数校验、链式调�?
- **经典 Agent 工作�?*：ReAct、Plan-and-Solve、Reflection、FunctionCall、SimpleAgent 开箱即�?
- **多层记忆系统**：工作记忆、情节记忆、语义记忆、感知记忆，四种类型统一管理
- **可插拔存储适配**：KV / 向量 / �?/ Blob，支持内存、Qdrant、Neo4j 及自定义后端
- **内置工具�?*：搜索、记忆、笔记、RAG、终端命令等常用工具
- **上下文管�?*：Token 感知的上下文构建器，精准控制 LLM 输入窗口
- **全量类型安全**：完�?TypeScript 类型声明，严格模式兼�?

---

## 包结�?

| 包名 | 说明 |
|------|------|
| [`@agenticforge/core`](packages/core) | 核心类型、LLM 客户端、消息结�?|
| [`@agenticforge/tools`](packages/tools) | Tool 抽象、ToolRegistry、ToolChain、AsyncToolExecutor |
| [`@agenticforge/agents`](packages/agents) | ReAct / Plan-Solve / Reflection / FunctionCall / Simple Agent |
| [`@agenticforge/memory`](packages/memory) | 多类型记忆管理器、RAG 流水线、存储适配�?|
| [`@agenticforge/tools-builtin`](packages/tools-builtin) | 内置工具：搜索、记忆、笔记、RAG、终�?|
| [`@agenticforge/context`](packages/context) | Token 感知上下文构建器 |
| [`@agenticforge/utils`](packages/utils) | LRU 缓存、Prompt 工具等通用工具 |
| [`@agenticforge/kit`](packages/kit) | 一站式入口，聚合所有包的导�?|

---

## 安装

```bash
# 一站式安装（推荐）
npm install @agenticforge/kit
# or
pnpm add @agenticforge/kit
```

按需安装单个包：

```bash
npm install @agenticforge/core @agenticforge/tools @agenticforge/agents
```

---

## 快速上�?

### 1. 创建一�?FunctionCall Agent

```ts
import {FunctionCallAgent, LLMClient, Tool, toolAction} from "@agenticforge/kit";
import {z} from "zod";

const weatherTool = new Tool({
  name: "get_weather",
  description: "获取指定城市的天�?,
  parameters: [
    {name: "city", type: "string", description: "城市名称", required: true},
  ],
  action: toolAction(z.object({city: z.string()}), async ({city}) => {
    return `${city} 今天晴，25°C`;
  }),
});

const llm = new LLMClient({provider: "openai", model: "gpt-4o"});
const agent = new FunctionCallAgent({llm, tools: [weatherTool]});

const result = await agent.run("北京今天天气怎么样？");
console.log(result);
```

### 2. 使用记忆系统

```ts
import {MemoryManager} from "@agenticforge/kit";

const memory = new MemoryManager({
  enableWorking: true,
  enableEpisodic: true,
  enableSemantic: true,
});

await memory.addMemory({
  content: "用户偏好：深色主题，字体大小 16px",
  memoryType: "semantic",
  importance: 0.8,
});

const results = await memory.retrieveMemories({
  query: "用户界面偏好",
  limit: 3,
  memoryTypes: ["semantic"],
});

console.log(results.map((r) => r.content));
```

---

## Agent 类型说明

| Agent | 适用场景 |
|-------|----------|
| `SimpleAgent` | 单轮/多轮对话，无工具调用 |
| `FunctionCallAgent` | 工具调用驱动，适合任务�?Agent |
| `ReActAgent` | 推理-行动循环，适合复杂推理任务 |
| `PlanSolveAgent` | 先规划后执行，适合多步骤任�?|
| `ReflectionAgent` | 带自我反思机制，适合高质量生成场�?|

---

## 本地开�?

```bash
git clone https://github.com/LittleBlacky/AgenticFORGE.git
cd AgenticFORGE
pnpm install
pnpm -r run build
```

---

## 贡献

欢迎提交 Issue �?Pull Request�?

---

## 许可�?

[MIT](LICENSE) © LittleBlacky
