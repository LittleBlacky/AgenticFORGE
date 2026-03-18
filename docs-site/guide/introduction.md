# Introduction

AgenticFORGE is a **TypeScript framework** for building production-ready AI agents. It is centered around **tool invocation** as the primary execution primitive, and ships with:

- 5 classic agent workflow implementations (ReAct, Plan-and-Solve, Reflection, FunctionCall, Simple)
- A composable multi-type memory system (working, episodic, semantic, perceptual)
- A built-in RAG pipeline with pluggable vector storage
- A token-aware context builder for LLM input window management
- A set of ready-to-use built-in tools (search, memory, notes, RAG, terminal)

## Why AgenticFORGE?

Most agent frameworks are either too opinionated (locked to one LLM provider or one architecture) or too low-level (you wire everything yourself). AgenticFORGE sits in the middle:

- **Opinionated where it matters**: clean agent loop abstractions, typed tool contracts, structured memory
- **Flexible where it counts**: swap LLM providers, storage backends, or memory types without rewriting logic
- **TypeScript-first**: full type safety from tool parameters to agent outputs

## Package Architecture

AgenticFORGE is a monorepo of focused packages:

| Package | Size | Role |
|---------|------|------|
| [`@agenticforge/kit`](/packages/kit) | 1.8 KB | All-in-one entry point |
| [`@agenticforge/core`](/packages/core) | 18 KB | LLM client, base types |
| [`@agenticforge/agents`](/packages/agents) | 14.5 KB | 5 agent implementations |
| [`@agenticforge/memory`](/packages/memory) | multi-entry | Memory manager + RAG |
| [`@agenticforge/tools`](/packages/tools) | 4.3 KB | Tool abstraction layer |
| [`@agenticforge/tools-builtin`](/packages/tools-builtin) | 45 KB | 5 ready-to-use tools |
| [`@agenticforge/context`](/packages/context) | 2.5 KB | Context builder |
| [`@agenticforge/utils`](/packages/utils) | 0.9 KB | Utilities |

## Next Steps

- [Quick Start](/guide/quickstart) — up and running in 60 seconds
- [Installation](/guide/installation) — install options and sub-path imports
- [Agents Guide](/guide/agents) — choose the right agent workflow
