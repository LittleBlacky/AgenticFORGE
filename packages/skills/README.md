# @agenticforge/skills

[![npm](https://img.shields.io/npm/v/@agenticforge/skills)](https://www.npmjs.com/package/@agenticforge/skills)
[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)


<p><a href="./README.zh_CN.md">中文</a> | <strong>English</strong></p>

Composable, routable Agent Skills for AgenticFORGE — define capabilities in **Markdown files** or **TypeScript classes**, and let the agent automatically route to the right one.

## Installation

```bash
npm install @agenticforge/skills
```

## What is a Skill?

A **Skill** is a named, self-contained agent capability unit — similar to a Semantic Kernel Plugin or a Copilot Studio Skill. Each skill encapsulates:

- A clear business purpose (`name` + `description`)
- An optional system prompt (its rules, persona, constraints)
- An optional set of tools (only this skill can use them)
- Its own `execute()` logic

Skills can be defined in two ways:

| Method | Best For |
|--------|----------|
| **Markdown file** (`.md`) | Non-engineers, rapid iteration, Cursor/Claude-style skill directories |
| **TypeScript class** | Complex logic, custom tool orchestration, programmatic control |

---

## Markdown Skills (recommended)

Create a `SKILL.md` file with a YAML frontmatter header:

```markdown
---
name: weather-assistant
description: Get real-time weather for any city. Use when the user asks about temperature, rain, or forecasts.
triggerHint: When the user asks about weather, temperature, rain, or wind
---

# Weather Assistant

## Role
You are a concise weather assistant. Answer only weather-related questions in plain language.

## Rules
- Always state the city and date in your answer.
- If weather data is unavailable, say so clearly.
- Do NOT answer non-weather questions.
```

Load skills from a directory:

```ts
import { SkillLoader, SkillRunner } from "@agenticforge/skills";

// Scan a directory for all SKILL.md files (recursive)
const registry = await SkillLoader.registryFromDirectory(".cursor/skills");

// Create a runner and auto-route the query to the best skill
const runner = new SkillRunner({ llm, skills: registry.all() });
const result = await runner.run("Is it raining in Tokyo today?");
console.log(result.output);
```

---

## TypeScript Skills

### Option A — Instantiate directly (simple cases)

```ts
import { AgentSkill, SkillRunner } from "@agenticforge/skills";

const weatherSkill = new AgentSkill({
  name: "weather",
  description: "Get real-time weather for any city",
  triggerHint: "When the user asks about temperature, rain, or forecasts",
  systemPrompt: "You are a concise weather assistant. Answer only weather-related questions.",
  tools: [weatherApiTool],
});

const runner = new SkillRunner({ llm, skills: [weatherSkill] });
const result = await runner.run("What is the weather in Paris?");
```

### Option B — Extend the base class (complex cases)

```ts
import { AgentSkill } from "@agenticforge/skills";
import type { SkillContext, SkillResult } from "@agenticforge/skills";
import type { LLMClient } from "@agenticforge/core";

class StockSkill extends AgentSkill {
  constructor() {
    super({
      name: "stock-query",
      description: "Look up real-time stock prices and financial data",
      triggerHint: "When the user asks about stock prices, market cap, or earnings",
    });
  }

  override async execute(ctx: SkillContext, llm: LLMClient): Promise<SkillResult> {
    const price = await fetchStockPrice(ctx.query);
    return { output: `Current price: ${price}` };
  }
}
```

---

## Multiple Skills with Auto-Routing

When multiple skills are registered, `SkillRunner` (and `SkillAgent`) use the LLM to classify the user's intent and dispatch to the best-matching skill:

```ts
import { SkillLoader, SkillRunner, AgentSkill } from "@agenticforge/skills";

// Mix Markdown skills and TypeScript skills freely
const mdSkills = await SkillLoader.fromDirectory(".cursor/skills");
const codeSkills = [new StockSkill(), new EmailSkill()];

const runner = new SkillRunner({
  llm,
  skills: [...mdSkills, ...codeSkills],
});

// Auto-routed to the right skill
await runner.run("What is Apple's stock price?");       // => StockSkill
await runner.run("Is it raining in Tokyo?");             // => weather SKILL.md
await runner.run("Draft a meeting invite for tomorrow"); // => EmailSkill

// Or call a specific skill directly (bypasses routing)
await runner.runSkill("stock-query", "AAPL price?");
```

---

## API Reference

### `MarkdownSkill`

| Method | Description |
|--------|-------------|
| `MarkdownSkill.fromFile(path)` | Load a skill from a `.md` file |
| `MarkdownSkill.fromSource(text)` | Parse a skill from a raw markdown string |
| `skill.execute(ctx, llm)` | Run the skill (injects body as system prompt) |

### `AgentSkill`

| Property / Method | Description |
|-------------------|-------------|
| `name` | Unique skill identifier |
| `description` | One-line summary used for routing |
| `triggerHint` | Describes when this skill should be triggered |
| `systemPrompt` | System prompt injected when the skill runs |
| `tools` | Tools available exclusively to this skill |
| `execute(ctx, llm)` | Default: LLM call with tool loop. Override for custom logic. |

### `SkillRegistry`

| Method | Description |
|--------|-------------|
| `register(skill)` | Add a skill |
| `get(name)` | Look up by name |
| `list()` | All registered skill names |
| `visible()` | Skills visible to the LLM router |
| `describeAll()` | Markdown bullet list for routing prompt |

### `SkillRunner`

| Method | Description |
|--------|-------------|
| `run(query, options?)` | Auto-route to the best skill and execute |
| `runSkill(name, query)` | Execute a named skill directly |
| `addSkill(skill)` | Register a skill at runtime |

### `SkillLoader`

| Method | Description |
|--------|-------------|
| `fromDirectory(dir)` | Scan a directory for `SKILL.md` files |
| `fromFiles(paths[])` | Load from explicit file paths |
| `fromSources(sources[])` | Load from raw markdown strings |
| `toRegistry(skills[])` | Wrap skills in a `SkillRegistry` |
| `registryFromDirectory(dir)` | `fromDirectory` + `toRegistry` in one call |

---

## Skill File Naming Convention

`SkillLoader` recognizes files named:
- `SKILL.md` (recommended, mirrors Cursor / Claude skills layout)
- `*.skill.md`

Other `.md` files (e.g. `examples.md`, `README.md`) are ignored.

---

## Using with SkillAgent (from `@agenticforge/agents`)

For a full Agent experience with conversation history and `runStructured`, use `SkillAgent`:

```ts
import { SkillAgent } from "@agenticforge/agents";
import { AgentSkill, SkillLoader } from "@agenticforge/skills";

const mdSkills = await SkillLoader.fromDirectory(".cursor/skills");

const agent = new SkillAgent({
  name: "my-assistant",
  llm,
  skills: mdSkills,
});

const reply = await agent.run("Is it raining in Tokyo?");
const result = await agent.runSkill("weather", "Tokyo weather tomorrow?");
```

---

## Links

- [GitHub](https://github.com/LittleBlacky/AgenticFORGE/tree/main/packages/skills)
- [npm](https://www.npmjs.com/package/@agenticforge/skills)
- [Root README](https://github.com/LittleBlacky/AgenticFORGE)
