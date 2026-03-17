<p align="center">
  <img src="assets/LOGO.png" alt="AgenticFORGE" width="300" />
</p>

<h3 align="center">以工具调用为核心的 TypeScript Agent 框架</h3>

<p align="center">
  <a href="https://www.npmjs.com/package/@agenticforge/kit"><img src="https://img.shields.io/npm/v/@agenticforge/kit?label=%40agenticforge%2Fkit" alt="npm version" /></a>
  <a href="https://github.com/LittleBlacky/AgenticFORGE/blob/main/LICENSE"><img src="https://img.shields.io/github/license/LittleBlacky/AgenticFORGE" alt="license" /></a>
  <a href="https://github.com/LittleBlacky/AgenticFORGE"><img src="https://img.shields.io/github/stars/LittleBlacky/AgenticFORGE?style=social" alt="stars" /></a>
</p>

---

## 简介 · Overview

AgenticFORGE 是一个面向 Agent 开发的 TypeScript 框架，以**工具调用**为核心驱动力，内置多种经典 Agent 工作流（ReAct、Plan-and-Solve、Reflection、FunctionCall），并提供可插拔的多层记忆系统与 RAG 流水线。

> A TypeScript agent framework driven by tool invocation, featuring classic agent workflows, a composable multi-type memory system, and a built-in RAG pipeline.

---

## 核心特性 · Features

- **工具驱动**：统一的 `Tool` / `ToolRegistry` / `ToolChain` 抽象，支持同步与异步工具、参数校验、链式调用
- **经典 Agent 工作流**：ReAct、Plan-and-Solve、Reflection、FunctionCall、SimpleAgent 开箱即用
- **多层记忆系统**：工作记忆、情节记忆、语义记忆、感知记忆，四种类型统一管理
- **可插拔存储适配**：KV / 向量 / 图 / Blob，支持内存、Qdrant、Neo4j 及自定义后端
- **内置工具集**：搜索、记忆、笔记、RAG、终端命令等常用工具
- **上下文管理**：Token 感知的上下文构建器，精准控制 LLM 输入窗口
- **全量类型安全**：完整 TypeScript 类型声明，严格模式兼容

---

## 包结构 · Packages

| 包名 | 说明 |
|------|------|
| [`@agenticforge/core`](packages/core) | 核心类型、LLM 客户端、消息结构 |
| [`@agenticforge/tools`](packages/tools) | Tool 抽象、ToolRegistry、ToolChain、AsyncToolExecutor |
| [`@agenticforge/agents`](packages/agents) | ReAct / Plan-Solve / Reflection / FunctionCall / Simple Agent |
| [`@agenticforge/memory`](packages/memory) | 多类型记忆管理器、RAG 流水线、存储适配层 |
| [`@agenticforge/tools-builtin`](packages/tools-builtin) | 内置工具：搜索、记忆、笔记、RAG、终端 |
| [`@agenticforge/context`](packages/context) | Token 感知上下文构建器 |
| [`@agenticforge/utils`](packages/utils) | LRU 缓存、Prompt 工具等通用工具 |
| [`@agenticforge/kit`](packages/kit) | 一站式入口，聚合所有包的导出 |

---

## 安装 · Installation

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

## 快速上手 · Quick Start

### 1. 创建一个 FunctionCall Agent

```ts
import {FunctionCallAgent, LLMClient} from "@agenticforge/kit";
import {Tool, toolAction} from "@agenticforge/kit";
import {z} from "zod";

// 定义工具
const weatherTool = new Tool({
  name: "get_weather",
  description: "获取指定城市的天气",
  parameters: [
    {name: "city", type: "string", description: "城市名称", required: true},
  ],
  action: toolAction(z.object({city: z.string()}), async ({city}) => {
    return `${city} 今天晴，25°C`;
  }),
});

// 创建 Agent
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

// 存储记忆
await memory.addMemory({
  content: "用户偏好：深色主题，字体大小 16px",
  memoryType: "semantic",
  importance: 0.8,
});

// 检索记忆
const results = await memory.retrieveMemories({
  query: "用户界面偏好",
  limit: 3,
  memoryTypes: ["semantic"],
});

console.log(results.map((r) => r.content));
```

### 3. 接入向量数据库（Qdrant）

```ts
import {MemoryManager} from "@agenticforge/kit";

const memory = new MemoryManager({
  enableSemantic: true,
  adapterConfigs: [
    {type: "vectorStore", backend: "qdrant", options: {url: "http://localhost:6333"}},
    {type: "graphStore", backend: "neo4j", options: {
      url: "bolt://localhost:7687",
      username: "neo4j",
      password: "password",
    }},
  ],
});

await memory.initialize();
```

---

## Agent 类型说明

| Agent | 适用场景 |
|-------|----------|
| `SimpleAgent` | 单轮/多轮对话，无工具调用 |
| `FunctionCallAgent` | 工具调用驱动，适合任务型 Agent |
| `ReActAgent` | 推理-行动循环，适合复杂推理任务 |
| `PlanSolveAgent` | 先规划后执行，适合多步骤任务 |
| `ReflectionAgent` | 带自我反思机制，适合高质量生成场景 |

---

## 本地开发 · Local Development

```bash
# 克隆仓库
git clone https://github.com/LittleBlacky/AgenticFORGE.git
cd AgenticFORGE

# 安装依赖
pnpm install

# 构建所有包
pnpm -r run build

# 类型检查
pnpm -r run typecheck

# 启动 Qdrant + Neo4j（可选）
docker compose up -d
```

---

## 贡献 · Contributing

欢迎提交 Issue 和 Pull Request。请先阅读贡献指南后再发起 PR。

Contributions are welcome. Please open an issue or pull request to discuss changes.

---

## 许可证 · License

[MIT](LICENSE) © LittleBlacky
