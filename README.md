

# AgenticFORGE

### A TypeScript Agent Framework Driven by Tool Invocation



[中文](./README.zh_CN.md) | **English**

---

## Overview

AgenticFORGE is a TypeScript framework for building AI agents. It is centered around **tool invocation**, ships with classic agent workflows (ReAct, Plan-and-Solve, Reflection, FunctionCall), a composable multi-type memory system, and a built-in RAG pipeline.

---

## Features

- **Tool-driven**: Unified `Tool` / `ToolRegistry` / `ToolChain` abstractions with sync/async support, parameter validation, and chaining
- **Classic agent workflows**: ReAct, Plan-and-Solve, Reflection, FunctionCall, and SimpleAgent - ready to use
- **Multi-layer memory**: Working, episodic, semantic, and perceptual memory types under a single manager
- **Pluggable storage**: KV / vector / graph / blob backends - in-memory, Qdrant, Neo4j, or custom
- **Built-in tools**: Search, memory, notes, RAG, and terminal tools included
- **Context management**: Token-aware context builder for precise LLM input window control
- **Full type safety**: Complete TypeScript declarations, strict-mode compatible

---

## Packages


| Package                                                 | Description                                                   |
| ------------------------------------------------------- | ------------------------------------------------------------- |
| `[@agenticforge/core](packages/core)`                   | Core types, LLM client, message structures                    |
| `[@agenticforge/tools](packages/tools)`                 | Tool abstraction, ToolRegistry, ToolChain, AsyncToolExecutor  |
| `[@agenticforge/agents](packages/agents)`               | ReAct / Plan-Solve / Reflection / FunctionCall / Simple Agent |
| `[@agenticforge/memory](packages/memory)`               | Multi-type memory manager, RAG pipeline, storage adapters     |
| `[@agenticforge/tools-builtin](packages/tools-builtin)` | Built-in tools: search, memory, notes, RAG, terminal          |
| `[@agenticforge/context](packages/context)`             | Token-aware context builder                                   |
| `[@agenticforge/utils](packages/utils)`                 | LRU cache, prompt utilities, and more                         |
| `[@agenticforge/protocols](packages/protocols)`         | MCP / A2A / ANP protocol implementations                      |
| `[@agenticforge/kit](packages/kit)`                     | All-in-one entry point - re-exports everything                |


---

## Installation

```bash
npm install @agenticforge/kit
```

---

## Agent Types


| Agent               | Best For                                                |
| ------------------- | ------------------------------------------------------- |
| `SimpleAgent`       | Single-turn or multi-turn conversation, no tools        |
| `FunctionCallAgent` | Tool-driven task execution                              |
| `ReActAgent`        | Reasoning-action loops for complex tasks                |
| `PlanSolveAgent`    | Plan first, then execute step by step                   |
| `ReflectionAgent`   | Self-critique for high-quality generation               |
| `SkillAgent`        | Routes queries to the best-matching Skill automatically |


---

## Local Development

```bash
git clone https://github.com/LittleBlacky/AgenticFORGE.git
cd AgenticFORGE
pnpm install
pnpm -r run build
```

---

## Contributing

Contributions are welcome. Please open an issue or pull request to discuss your changes.

---

## License

[CC BY-NC-SA 4.0](LICENSE) � LittleBlacky

---

## Acknowledgements

This project is built upon and extends [Hello-Agents](https://github.com/datawhalechina/Hello-Agents) (licensed under CC BY-NC-SA 4.0). Many thanks to the original authors and contributors for their outstanding work. The TypeScript port and extensions were completed by [LittleBlacky](https://github.com/LittleBlacky).