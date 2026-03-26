<p align="center">
  <img src="assets/LOGO.png" alt="AgenticFORGE" width="200" />
</p>

<h1 align="center">AgenticFORGE</h1>

<h3 align="center">Build production-ready TypeScript AI agents with tools, memory, skills, and protocols.</h3>

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
  <a href="./README.zh_CN.md">中文</a> | <strong>English</strong>
</p>

---

## Overview

AgenticFORGE is a monorepo TypeScript framework for building tool-driven AI agents.
It provides a complete stack from core LLM abstractions to advanced agent workflows, skill routing, memory + RAG, built-in tools, and multi-agent communication protocols.

If you want one unified SDK to build from a simple chatbot to a production multi-agent system, start with `@agenticforge/kit`.

---

## Why AgenticFORGE

- **Tool-first architecture**: Standardized `Tool`, `ToolRegistry`, `ToolChain`, and async execution model
- **Multiple agent paradigms**: `Simple`, `FunctionCall`, `ReAct`, `PlanSolve`, `Reflection`, `SkillAgent`, and `WorkflowAgent`
- **Skill system**: Define skills with `SKILL.md` or TypeScript classes; `SkillDispatcher` auto-routes by keyword (zero LLM cost) then LLM intent; `withSkills` mixin adds skill routing to any Agent type
- **Memory + RAG built-in**: Working / episodic / semantic / perceptual memory with pluggable stores
- **Protocol layer included**: MCP, A2A, and ANP implementations for inter-agent communication
- **Production-friendly TypeScript**: ESM/CJS builds, strict typing, modular packages, and subpath imports

---

## Package Architecture

| Package | Purpose |
| --- | --- |
| [`@agenticforge/kit`](packages/kit) | One-stop package that re-exports the core ecosystem |
| [`@agenticforge/core`](packages/core) | Agent base types, message model, `LLMClient`, hooks & metrics |
| [`@agenticforge/tools`](packages/tools) | Tool abstraction, schema validation, registry, chain, async execution |
| [`@agenticforge/agents`](packages/agents) | Built-in agent implementations and workflow orchestration |
| [`@agenticforge/workflow`](packages/workflow) | Standalone DAG workflow engine (`WorkflowEngine` + types) |
| [`@agenticforge/skills`](packages/skills) | Markdown / TypeScript skill definitions, loading, routing, execution |
| [`@agenticforge/memory`](packages/memory) | MemoryManager, storage adapters, embedding support, RAG pipeline |
| [`@agenticforge/tools-builtin`](packages/tools-builtin) | Ready-to-use tools: search, memory, notes, RAG, terminal |
| [`@agenticforge/context`](packages/context) | Token-aware context composition and budget management |
| [`@agenticforge/protocols`](packages/protocols) | MCP / A2A / ANP protocol implementations |
| [`@agenticforge/utils`](packages/utils) | Shared utility helpers (cache, prompt helpers, etc.) |

---

## Agent Types

| Agent | Best For |
| --- | --- |
| `SimpleAgent` | Multi-turn conversation without tool execution |
| `FunctionCallAgent` | Reliable tool-invocation workflows |
| `ReActAgent` | Iterative reasoning + action loops |
| `PlanSolveAgent` | Plan-first decomposition for complex tasks |
| `ReflectionAgent` | Self-critique and answer refinement |
| `SkillAgent` | Intent-based capability routing across many skills |
| `WorkflowAgent` | DAG-style orchestration with parallelizable nodes |

---

## Quick Start

### 1) Install

```bash
npm install @agenticforge/kit zod
```

### 2) Minimal Tool-Driven Agent

```ts
import { LLMClient, FunctionCallAgent, Tool, toolAction } from "@agenticforge/kit";
import { z } from "zod";

const calculator = new Tool({
  name: "calculator",
  description: "Evaluate a simple expression: a+b, a-b, a*b, a/b",
  parameters: [{ name: "expr", type: "string", required: true }],
  action: toolAction(
    z.object({ expr: z.string() }),
    async ({ expr }) => {
      const safe = expr.match(/^\s*[-\d.]+\s*[+\-*/]\s*[-\d.]+\s*$/);
      if (!safe) return "Unsupported expression";
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

const output = await agent.run("What is (123 + 456) * 2?");
console.log(output);
```

---

## Skills (Markdown + TypeScript)

AgenticFORGE supports two skill authoring styles:

- **Markdown skills** (`SKILL.md` / `*.skill.md`) for fast iteration
- **TypeScript skills** (`AgentSkill`) for custom logic and deeper control

```ts
import { SkillLoader, SkillRunner } from "@agenticforge/skills";

const skills = await SkillLoader.fromDirectory(".cursor/skills");
const runner = new SkillRunner({ llm, skills });

const result = await runner.run("Is it raining in Tokyo tomorrow?");
console.log(result.output);
```

---

## Memory and RAG

Use `MemoryManager` to combine short-term and long-term memory, then layer retrieval with the built-in RAG pipeline.

```ts
import { MemoryManager } from "@agenticforge/memory";

const memory = new MemoryManager({
  enableWorking: true,
  enableEpisodic: true,
  enableSemantic: true,
});

await memory.addMemory({
  content: "User prefers concise answers.",
  memoryType: "semantic",
  importance: 0.8,
});

const recalled = await memory.retrieveMemories({
  query: "response style preference",
  limit: 3,
  memoryTypes: ["semantic"],
});

console.log(recalled);
```

---

## Protocols (MCP / A2A / ANP)

`@agenticforge/protocols` includes practical protocol implementations to expose tools, connect agents, and manage networks:

- **MCP**: Standardized tool/resource access
- **A2A**: Agent-to-agent skill invocation
- **ANP**: Service discovery, topology, and routing

---

## Monorepo Apps & Docs

This repository also includes:

- `apps/second-brain` — an end-to-end sample app (frontend + backend) built with AgenticFORGE
- `docs-site/` — VitePress documentation site
- `.cursor/skills/` and `skills/` — reusable skill templates and examples

---

## AI-Assisted Development with Skills

Every AgenticFORGE package ships with a companion `SKILL.md` under `skills/`, designed to be loaded into AI coding assistants (Cursor, Windsurf, etc.) as context-aware skills.

| Skill | Covers |
| --- | --- |
| [`agenticforge-agents`](skills/agenticforge-agents/SKILL.md) | Agent selection, configuration, WorkflowAgent DAG patterns |
| [`agenticforge-tools`](skills/agenticforge-tools/SKILL.md) | Tool authoring, ToolRegistry, ToolChain, AsyncToolExecutor |
| [`agenticforge-memory`](skills/agenticforge-memory/SKILL.md) | WorkingMemory, EpisodicMemory, SemanticMemory, RAG pipeline |
| [`agenticforge-skills`](skills/agenticforge-skills/SKILL.md) | SKILL.md authoring, SkillRunner, SkillLoader, routing |
| [`agenticforge-context`](skills/agenticforge-context/SKILL.md) | ContextBuilder, token budget management |
| [`agenticforge-protocols`](skills/agenticforge-protocols/SKILL.md) | MCP, A2A, ANP protocol setup |
| [`agenticforge-debugging`](skills/agenticforge-debugging/SKILL.md) | Diagnosing agent loop errors, tool failures, type errors |
| [`agenticforge-vibe-coding`](skills/agenticforge-vibe-coding/SKILL.md) | All-in-one assistant for rapid AgenticFORGE development |

To load them into Cursor, add the `skills/` directory to your `.cursor/skills/` path or reference individual `SKILL.md` files in your project rules.

---

## Local Development

```bash
git clone https://github.com/LittleBlacky/AgenticFORGE.git
cd AgenticFORGE
pnpm install
pnpm -r run build
pnpm test
```

---

## Documentation

- Docs site: [`docs-site/`](docs-site)
- Guide entry: [`docs-site/guide/introduction`](docs-site/guide/introduction.md)
- Package-level docs: each package contains its own `README.md`

---

## Contributing

Issues and pull requests are welcome.

If you plan a larger feature or API change, please open an issue first so we can align on design and scope.

---

## License

[CC BY-NC-SA 4.0](LICENSE) © LittleBlacky

---

## Acknowledgements

This project builds upon and extends [Hello-Agents](https://github.com/datawhalechina/Hello-Agents) (licensed under CC BY-NC-SA 4.0).
Thanks to the original authors and contributors. TypeScript porting and major extensions are by [LittleBlacky](https://github.com/LittleBlacky).
