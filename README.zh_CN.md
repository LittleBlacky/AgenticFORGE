<p align="center">
  <img src="assets/LOGO.png" alt="AgenticFORGE" width="200" />
</p>

<h1 align="center">AgenticFORGE</h1>

<h3 align="center">使用工具、记忆、技能与协议构建生产级 TypeScript AI Agent。</h3>

<p align="center">
  <a href="https://www.npmjs.com/package/@agenticforge/kit"><img src="https://img.shields.io/npm/v/@agenticforge/kit?label=%40agenticforge%2Fkit" alt="npm version" /></a>
  <a href="https://codecov.io/gh/LittleBlacky/AgenticFORGE"><img src="https://codecov.io/gh/LittleBlacky/AgenticFORGE/branch/main/graph/badge.svg?token=CODECOV_TOKEN" alt="coverage" /></a>
  <a href="https://github.com/LittleBlacky/AgenticFORGE"><img src="https://img.shields.io/github/last-commit/LittleBlacky/AgenticFORGE" alt="last commit" /></a>
  <a href="https://github.com/LittleBlacky/AgenticFORGE/blob/main/package.json"><img src="https://img.shields.io/badge/pnpm-10.x-F69220?logo=pnpm&logoColor=white" alt="pnpm" /></a>
  <a href="https://github.com/LittleBlacky/AgenticFORGE/blob/main/package.json"><img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white" alt="TypeScript" /></a>
  <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/"><img src="https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg" alt="License" /></a>
  <a href="https://github.com/LittleBlacky/AgenticFORGE"><img src="https://img.shields.io/github/stars/LittleBlacky/AgenticFORGE?style=social" alt="GitHub stars" /></a>
</p>

<p align="center">
  <strong>中文</strong> | <a href="./README.md">English</a>
</p>

---

## 项目简介

AgenticFORGE 是一个用于构建工具驱动 AI Agent 的 TypeScript Monorepo 框架。
它覆盖了从 LLM 核心抽象到高级 Agent 工作流、Skill 路由、Memory + RAG、内置工具以及多 Agent 通信协议的完整能力栈。

如果你希望用一个统一 SDK，从简单对话助手构建到生产级多 Agent 系统，可以从 `@agenticforge/kit` 开始。

---

## 为什么选择 AgenticFORGE

- **工具优先架构**：统一的 `Tool`、`ToolRegistry`、`ToolChain` 与异步执行模型
- **多种 Agent 范式**：`Simple`、`FunctionCall`、`ReAct`、`PlanSolve`、`Reflection`、`SkillAgent`、`WorkflowAgent`
- **Skill 系统**：支持 `SKILL.md` 与 TypeScript 两种定义方式，按意图自动路由
- **内置 Memory + RAG**：工作/情节/语义/感知记忆统一管理，可插拔存储
- **协议层开箱即用**：内置 MCP、A2A、ANP 协议实现
- **面向生产的 TypeScript 体验**：ESM/CJS、严格类型、模块化包与子路径导入

---

## 包架构总览

| 包名 | 作用 |
| --- | --- |
| [`@agenticforge/kit`](packages/kit) | 一站式总入口，重导出核心生态 |
| [`@agenticforge/core`](packages/core) | Agent 基础类型、消息模型、`LLMClient`、Hooks 与 Metrics |
| [`@agenticforge/tools`](packages/tools) | Tool 抽象、参数校验、注册中心、工具链、异步执行 |
| [`@agenticforge/agents`](packages/agents) | 内置 Agent 实现与工作流编排 |
| [`@agenticforge/workflow`](packages/workflow) | 独立 DAG 工作流引擎（`WorkflowEngine` + 类型定义） |
| [`@agenticforge/skills`](packages/skills) | Markdown/TypeScript Skill 定义、加载、路由与执行 |
| [`@agenticforge/memory`](packages/memory) | MemoryManager、存储适配器、Embedding、RAG 管道 |
| [`@agenticforge/tools-builtin`](packages/tools-builtin) | 开箱即用工具：搜索、记忆、笔记、RAG、终端 |
| [`@agenticforge/context`](packages/context) | Token 感知上下文构建与预算控制 |
| [`@agenticforge/protocols`](packages/protocols) | MCP / A2A / ANP 协议实现 |
| [`@agenticforge/utils`](packages/utils) | 公共工具能力（缓存、Prompt 辅助等） |

---

## Agent 类型

| Agent | 适用场景 |
| --- | --- |
| `SimpleAgent` | 无工具执行的多轮对话 |
| `FunctionCallAgent` | 稳定可靠的工具调用流程 |
| `ReActAgent` | 推理 + 行动迭代循环 |
| `PlanSolveAgent` | 先规划再执行的复杂任务拆解 |
| `ReflectionAgent` | 自我反思与答案优化 |
| `SkillAgent` | 多能力场景下的意图路由 |
| `WorkflowAgent` | 可并行节点的 DAG 工作流编排 |

---

## 快速开始

### 1) 安装

```bash
npm install @agenticforge/kit zod
```

### 2) 最小可运行的工具型 Agent

```ts
import { LLMClient, FunctionCallAgent, Tool, toolAction } from "@agenticforge/kit";
import { z } from "zod";

const calculator = new Tool({
  name: "calculator",
  description: "计算简单表达式：a+b、a-b、a*b、a/b",
  parameters: [{ name: "expr", type: "string", required: true }],
  action: toolAction(
    z.object({ expr: z.string() }),
    async ({ expr }) => {
      const safe = expr.match(/^\s*[-\d.]+\s*[+\-*/]\s*[-\d.]+\s*$/);
      if (!safe) return "不支持的表达式";
      return String(Function(`"use strict"; return (${expr})`)());
    }
  ),
});

const llm = new LLMClient({
  provider: "openai",
  model: "gpt-4o",
  apiKey: process.env.OPENAI_API_KEY,
});

const agent = new FunctionCallAgent({
  llm,
  tools: [calculator],
});

const output = await agent.run("(123 + 456) * 2 等于多少？");
console.log(output);
```

---

## Skills（Markdown + TypeScript）

AgenticFORGE 提供两种 Skill 编写方式：

- **Markdown Skill**：`SKILL.md` / `*.skill.md`，适合快速迭代
- **TypeScript Skill**：`AgentSkill`，适合复杂逻辑与精细控制

```ts
import { SkillLoader, SkillRunner } from "@agenticforge/skills";

const skills = await SkillLoader.fromDirectory(".cursor/skills");
const runner = new SkillRunner({ llm, skills });

const result = await runner.run("明天东京会下雨吗？");
console.log(result.output);
```

---

## Memory 与 RAG

使用 `MemoryManager` 统一管理短期与长期记忆，再结合内置 RAG 管道实现检索增强生成。

```ts
import { MemoryManager } from "@agenticforge/memory";

const memory = new MemoryManager({
  enableWorking: true,
  enableEpisodic: true,
  enableSemantic: true,
});

await memory.addMemory({
  content: "用户偏好简洁回答。",
  memoryType: "semantic",
  importance: 0.8,
});

const recalled = await memory.retrieveMemories({
  query: "回答风格偏好",
  limit: 3,
  memoryTypes: ["semantic"],
});

console.log(recalled);
```

---

## 协议层（MCP / A2A / ANP）

`@agenticforge/protocols` 提供实用协议实现，用于暴露工具、连接 Agent 与管理网络：

- **MCP**：标准化工具/资源访问
- **A2A**：Agent 间 Skill 调用
- **ANP**：服务发现、拓扑与路由

---

## 仓库内应用与文档

本仓库还包含：

- `apps/second-brain`：基于 AgenticFORGE 的端到端示例应用（frontend + backend）
- `docs-site/`：VitePress 文档站
- `.cursor/skills/` 与 `skills/`：可复用的 Skill 模板与示例

---

## AI 辅助开发：配套 Skills

AgenticFORGE 每个核心包都附带一份 `SKILL.md`，存放在 `skills/` 目录下，可加载到 Cursor、Windsurf 等 AI 编码助手中作为上下文感知技能。

| Skill | 覆盖内容 |
| --- | --- |
| [`agenticforge-agents`](skills/agenticforge-agents/SKILL.md) | Agent 选型、配置、WorkflowAgent DAG 模式 |
| [`agenticforge-tools`](skills/agenticforge-tools/SKILL.md) | Tool 编写、ToolRegistry、ToolChain、AsyncToolExecutor |
| [`agenticforge-memory`](skills/agenticforge-memory/SKILL.md) | WorkingMemory、EpisodicMemory、SemanticMemory、RAG 管道 |
| [`agenticforge-skills`](skills/agenticforge-skills/SKILL.md) | SKILL.md 编写、SkillRunner、SkillLoader、意图路由 |
| [`agenticforge-context`](skills/agenticforge-context/SKILL.md) | ContextBuilder、Token 预算管理 |
| [`agenticforge-protocols`](skills/agenticforge-protocols/SKILL.md) | MCP、A2A、ANP 协议配置 |
| [`agenticforge-debugging`](skills/agenticforge-debugging/SKILL.md) | Agent 循环错误、工具调用失败、类型错误诊断 |
| [`agenticforge-vibe-coding`](skills/agenticforge-vibe-coding/SKILL.md) | 一站式 AgenticFORGE 快速开发助手 |

在 Cursor 中使用时，将 `skills/` 目录加入 `.cursor/skills/` 路径，或在项目规则中直接引用各 `SKILL.md` 文件。

---

## 本地开发

```bash
git clone https://github.com/LittleBlacky/AgenticFORGE.git
cd AgenticFORGE
pnpm install
pnpm -r run build
pnpm test
```

---

## 文档入口

- 文档站：[`docs-site/`](docs-site)
- 指南入口：[`docs-site/guide/introduction`](docs-site/guide/introduction.md)
- 包级文档：每个 package 下均有独立 `README.md`

---

## 贡献

欢迎提交 Issue 与 Pull Request。

如果是较大的功能或 API 变更，建议先开 Issue 对齐设计与范围。

---

## 许可证

[CC BY-NC-SA 4.0](LICENSE) © LittleBlacky

---
