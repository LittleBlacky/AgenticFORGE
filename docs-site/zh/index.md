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
  - icon:
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>'
    title: 工具驱动
    details: 统一的 Tool / ToolRegistry / ToolChain 抽象，支持同步与异步工具、Zod 参数校验与链式调用。

  - icon:
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-1.14"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-1.14"/></svg>'
    title: 五种 Agent 工作流
    details: ReAct、Plan-and-Solve、Reflection、FunctionCall、Simple — 开笱即用，按需选择。

  - icon:
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"/></svg>'
    title: 多层记忆系统
    details: 工作记忆、情节记忆、语义记忆、感知记忆，四种类型由统一的 MemoryManager 管理。

  - icon:
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22V8"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/><circle cx="12" cy="5" r="3"/></svg>'
    title: 可插拔存储
    details: 内存、Qdrant、Neo4j — 切换后端无需修改业务代码。

  - icon:
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>'
    title: 内置 RAG
    details: 文档索引、语义搜索、基于检索的问答 — 全部内置，无需额外集成。

  - icon:
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>'
    title: 全量类型安全
    details: 完整 TypeScript 类型声明，严格模式兼容，公开 API 无 any。
---
