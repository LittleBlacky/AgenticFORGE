---
layout: home

hero:
  name: AgenticFORGE
  text: TypeScript Agent 框架
  tagline: 以工具调用为核心，内置 ReAct、Plan-and-Solve、Reflection、FunctionCall 等经典工作流，以及可插拔多层记忆系统与 RAG 流水线。
  image:
    src: /logo.png
    alt: AgenticFORGE
  actions:
    - theme: brand
      text: 快速开始
      link: /zh/guide/introduction
    - theme: alt
      text: 在 GitHub 上查看
      link: https://github.com/LittleBlacky/AgenticFORGE
    - theme: alt
      text: npm 安装
      link: https://www.npmjs.com/package/@agenticforge/kit

features:
  - icon: ⚡
    title: 工具驱动
    details: 统一的 Tool / ToolRegistry / ToolChain 抽象，支持同步与异步工具、Zod 参数校验与链式调用。

  - icon: 🧠
    title: 五种 Agent 工作流
    details: ReAct、Plan-and-Solve、Reflection、FunctionCall、Simple — 开箱即用，按需选择。

  - icon: 🗄️
    title: 多层记忆系统
    details: 工作记忆、情节记忆、语义记忆、感知记忆，四种类型由统一的 MemoryManager 管理。

  - icon: 🔌
    title: 可插拔存储
    details: 内存、Qdrant、Neo4j — 切换后端无需修改业务代码。

  - icon: 📖
    title: 内置 RAG
    details: 文档索引、语义搜索、基于检索的问答 — 全部内置，无需额外集成。

  - icon: 🛡️
    title: 全量类型安全
    details: 完整 TypeScript 类型声明，严格模式兼容，公开 API 无 any。
---
