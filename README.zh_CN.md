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

AgenticFORGE 是一个用于构建 Agent 的 TypeScript 框架，以**工具调用**为核心，内置多种经典 Agent 工作流（ReAct、Plan-and-Solve、Reflection、FunctionCall），支持多类型记忆体系与内置 RAG 管道。

---

## 核心特性

- **工具驱动**：统一的 `Tool` / `ToolRegistry` / `ToolChain` 抽象，支持同步/异步、参数校验、链式调用
- **经典 Agent 工作流**：ReAct、Plan-and-Solve、Reflection、FunctionCall、SimpleAgent，开箱即用
- **Skill 系统**：用 Markdown 文件或 TypeScript 类定义能力单元，Agent 自动路由到最合适的 Skill
- **多类型记忆**：工作记忆、情节记忆、语义记忆、感知记忆，统一管理接口
- **可插拔存储后端**：KV / 向量 / 图 / Blob 存储，支持内存、Qdrant、Neo4j 或自定义
- **内置工具集**：搜索、记忆、笔记、RAG、终端工具，开箱即用
- **上下文管理**：Token 感知的上下文构建器，精确控制 LLM 输入窗口
- **完整类型安全**：完整 TypeScript 声明，严格模式兼容

---

## 子包列表

| 包名 | 描述 |
|------|------|
| [`@agenticforge/core`](packages/core) | 核心类型、LLM 客户端、消息结构 |
| [`@agenticforge/tools`](packages/tools) | Tool 抽象层、ToolRegistry、ToolChain、AsyncToolExecutor |
| [`@agenticforge/agents`](packages/agents) | ReAct / Plan-Solve / Reflection / FunctionCall / Simple / SkillAgent |
| [`@agenticforge/skills`](packages/skills) | 可组合、可路由的 Skill 系统，支持 Markdown 和 TypeScript Skill |
| [`@agenticforge/memory`](packages/memory) | 多类型记忆管理器、RAG 管道、存储适配器 |
| [`@agenticforge/tools-builtin`](packages/tools-builtin) | 内置工具：搜索、记忆、笔记、RAG、终端 |
| [`@agenticforge/context`](packages/context) | Token 感知上下文构建器 |
| [`@agenticforge/utils`](packages/utils) | LRU 缓存、Prompt 工具函数等 |
| [`@agenticforge/protocols`](packages/protocols) | MCP / A2A / ANP 协议实现 |
| [`@agenticforge/kit`](packages/kit) | 一体化入口，重新导出全部模块 |

---

## 安装

```bash
npm install @agenticforge/kit
```

---

## Agent 类型对照

| Agent | 适用场景 |
|-------|----------|
| `SimpleAgent` | 单轮/多轮对话，无需工具 |
| `FunctionCallAgent` | 工具调用驱动的任务型 Agent |
| `ReActAgent` | 推理-行动循环，适合复杂推理 |
| `PlanSolveAgent` | 先规划后逐步执行多步骤任务 |
| `ReflectionAgent` | 带自我批评机制，适合高质量生成 |
| `SkillAgent` | 自动路由到最合适的 Skill，多能力切换 |

---

## 本地开发

```bash
git clone https://github.com/LittleBlacky/AgenticFORGE.git
cd AgenticFORGE
pnpm install
pnpm -r run build
```

---

## 贡献

欢迎提交 Issue 或 Pull Request。

---

## 许可证

[CC BY-NC-SA 4.0](LICENSE) © LittleBlacky

---

## 致谢

本项目基于 [Hello-Agents](https://github.com/datawhalechina/Hello-Agents)（CC BY-NC-SA 4.0 许可）进行扩展，感谢原作者和贡献者的杰出工作。TypeScript 移植与功能扩展由 [LittleBlacky](https://github.com/LittleBlacky) 完成。
