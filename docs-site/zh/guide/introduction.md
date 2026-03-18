# 简介

AgenticFORGE 是一个面向生产环境的 **TypeScript Agent 框架**，以**工具调用**为核心执行原语，内置：

- 5 种经典 Agent 工作流（ReAct、Plan-and-Solve、Reflection、FunctionCall、Simple）
- 可组合的多类型记忆系统（工作、情节、语义、感知）
- 内置 RAG 流水线，支持可插拔向量存储
- Token 感知的上下文构建器
- 开箱即用的内置工具集（搜索、记忆、笔记、RAG、终端）

## 为什么选择 AgenticFORGE？

大多数 Agent 框架要么过于固执（锁定单一 LLM 提供商或架构），要么过于底层（需要自己连接所有组件）。AgenticFORGE 介于两者之间：

- **在关键处有主见**：清晰的 Agent 循环抽象、类型化工具契约、结构化记忆
- **在重要处保持灵活**：可切换 LLM 提供商、存储后端、记忆类型，无需重写逻辑
- **TypeScript 优先**：从工具参数到 Agent 输出，全链路类型安全

## 包架构

AgenticFORGE 是一个聚焦的 monorepo：

| 包 | 大小 | 职责 |
|---------|------|------|
| [`@agenticforge/kit`](/zh/packages/kit) | 1.8 KB | 一站式入口 |
| [`@agenticforge/core`](/zh/packages/core) | 18 KB | LLM 客户端、基础类型 |
| [`@agenticforge/agents`](/zh/packages/agents) | 14.5 KB | 5 种 Agent 实现 |
| [`@agenticforge/memory`](/zh/packages/memory) | 多入口 | 记忆管理器 + RAG |
| [`@agenticforge/tools`](/zh/packages/tools) | 4.3 KB | 工具抽象层 |
| [`@agenticforge/tools-builtin`](/zh/packages/tools-builtin) | 45 KB | 5 个内置工具 |
| [`@agenticforge/context`](/zh/packages/context) | 2.5 KB | 上下文构建器 |
| [`@agenticforge/utils`](/zh/packages/utils) | 0.9 KB | 通用工具 |

## 下一步

- [快速开始](/zh/guide/quickstart) — 60 秒内跑通第一个 Agent
- [安装](/zh/guide/installation) — 安装选项与子路径导入
- [Agent 指南](/zh/guide/agents) — 选择合适的工作流
