<p align="center">
  <img src="assets/LOGO.png" alt="AgenticFORGE" width="200" />
</p>

<h1 align="center">AgenticFORGE</h1>

<h3 align="center">以工具调用为核心的 TypeScript Agent 框架</h3>

<p align="center">
  <strong>中文</strong> | <a href="./README.md">English</a>
</p>

---

## 简介

AgenticFORGE 是一个面向 Agent 开发的 TypeScript 框架，以**工具调用**为核心驱动力，内置经典 Agent 工作流（ReAct、Plan-and-Solve、Reflection、FunctionCall）、可组合的多类型记忆系统与内置 RAG 流水线。

---

## 核心特性

- **工具驱动**：统一的 `Tool` / `ToolRegistry` / `ToolChain` 抽象，支持同步/异步、参数校验与链式组合
- **经典 Agent 工作流**：ReAct、Plan-and-Solve、Reflection、FunctionCall、SimpleAgent，开箱即用
- **多层记忆系统**：工作记忆、情节记忆、语义记忆、感知记忆，统一管理器
- **可插拔存储适配**：KV / 向量 / 图 / Blob 后端，支持内存、Qdrant、Neo4j 或自定义
- **内置工具集**：搜索、记忆、笔记、RAG、终端命令工具
- **上下文管理**：Token 感知的上下文构建器，精确控制 LLM 输入窗口
- **全量类型安全**：完整 TypeScript 类型声明，严格模式兼容

---

## 包结构

| 包名 | 说明 |
|------|------|
| [`@agenticforge/core`](packages/core) | 核心类型、LLM 客户端、消息结构 |
| [`@agenticforge/tools`](packages/tools) | Tool 抽象、ToolRegistry、ToolChain、AsyncToolExecutor |
| [`@agenticforge/agents`](packages/agents) | ReAct / Plan-Solve / Reflection / FunctionCall / Simple Agent |
| [`@agenticforge/memory`](packages/memory) | 多类型记忆管理器、RAG 流水线、存储适配层 |
| [`@agenticforge/tools-builtin`](packages/tools-builtin) | 内置工具：搜索、记忆、笔记、RAG、终端 |
| [`@agenticforge/context`](packages/context) | Token 感知上下文构建器 |
| [`@agenticforge/utils`](packages/utils) | LRU 缓存、Prompt 工具等通用工具 |
| [`@agenticforge/protocols`](packages/protocols) | MCP / A2A / ANP 协议实现 |
| [`@agenticforge/kit`](packages/kit) | 一站式入口，聚合所有包的导出 |

---

## 安装

```bash
npm install @agenticforge/kit
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

## 本地开发

```bash
git clone https://github.com/LittleBlacky/AgenticFORGE.git
pnpm install
pnpm -r run build
```

---

## 贡献

欢迎提交 Issue 和 Pull Request。

---

## 许可证

[CC BY-NC-SA 4.0](LICENSE) © LittleBlacky

---

## 致谢

本项目基于 [Hello-Agents](https://github.com/datawhalechina/Hello-Agents)（CC BY-NC-SA 4.0 许可证）开发，感谢原项目作者及贡献者的杰出工作。TypeScript 移植与扩展由 [LittleBlacky](https://github.com/LittleBlacky) 完成。