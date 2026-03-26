# @agenticforge/skills

[![npm](https://img.shields.io/npm/v/@agenticforge/skills)](https://www.npmjs.com/package/@agenticforge/skills)
[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)

<p><a href="./README.zh_CN.md">中文</a> | <strong>English</strong></p>

Composable, routable agent capabilities for AgenticFORGE. Define each capability as a focused **Skill** — in Markdown or TypeScript — and let the framework automatically route user queries to the right one.

## Installation

```bash
npm install @agenticforge/skills
```

---

## What is a Skill?

A Skill is a named, self-contained capability unit. Think of it as a specialized expert your agent can delegate to:

- A **weather skill** that only handles weather questions
- A **code review skill** that critiques TypeScript code
- A **stock lookup skill** that queries real-time market data

Each skill owns its system prompt, its tools, and its execution logic. When a user query arrives, the framework routes it to the best-matching skill automatically.

---

## Defining Skills

### Option 1 — Markdown (recommended for most cases)

Create a `SKILL.md` file. The frontmatter defines routing metadata; the body becomes the system prompt.

```markdown
---
name: code-reviewer
description: Review TypeScript and JavaScript code for bugs, type safety issues, and performance problems.
triggerHint: When the user asks to review, check, or improve code quality
---

# Code Reviewer

You are a senior TypeScript engineer doing a thorough code review.
Focus on correctness first, then performance, then style.

## Review checklist
- Type safety: no implicit `any`, proper return types
- Error handling: no unhandled promise rejections
- Edge cases: null/undefined, empty arrays
- Performance: unnecessary loops, memory leaks

## Output format
1. **Summary** — one sentence overall verdict
2. **Issues** — each with severity (critical / warning / suggestion) and a suggested fix
3. **Improved code** — rewrite the problematic sections
```

Load and run it:

```ts
import { SkillLoader, SkillRunner } from "@agenticforge/skills";

const skills = await SkillLoader.fromDirectory("./skills");
const runner = new SkillRunner({ llm, skills });

const result = await runner.run(`
  Review this function:
  async function fetchUser(id) {
    const res = await fetch('/api/users/' + id);
    return res.json();
  }
`);
console.log(result.output);
// => "**Summary**: Function lacks error handling and has unsafe type usage..."
```

### Option 2 — TypeScript class (for custom execution logic)

Use `AgentSkill` directly when the skill needs to call external APIs, run custom logic, or orchestrate its own tools:

```ts
import { AgentSkill } from "@agenticforge/skills";
import type { SkillContext, SkillResult } from "@agenticforge/skills";
import type { LLMClient } from "@agenticforge/core";

// A stock lookup skill that fetches real-time prices and formats a response
class StockSkill extends AgentSkill {
  constructor() {
    super({
      name: "stock-query",
      description: "Look up real-time stock prices and market data for any ticker symbol.",
      triggerHint: "When the user asks about stock prices, market cap, ticker, or trading data",
    });
  }

  override async execute(ctx: SkillContext, llm: LLMClient): Promise<SkillResult> {
    // Fetch from your data provider
    const price = await fetchStockPrice(extractTicker(ctx.query));
    // Ask the LLM to format a natural response
    const output = await llm.think([
      { role: "system", content: "Format the stock data as a brief, friendly response." },
      { role: "user",   content: `Ticker data: ${JSON.stringify(price)}\nUser asked: ${ctx.query}` },
    ]);
    return { output };
  }
}
```

For simpler cases, instantiate `AgentSkill` directly without extending:

```ts
const translatorSkill = new AgentSkill({
  name: "translator",
  description: "Translate text between any two languages.",
  triggerHint: "When the user wants to translate text or asks how to say something in another language",
  systemPrompt: "You are a professional translator. Output only the translated text, nothing else.",
});
```

---

## Routing Multiple Skills

The real power of the skill system shows when you have many capabilities and want the agent to pick the right one automatically.

`SkillRunner` (and `SkillAgent`) use a **two-level routing strategy** that balances speed and accuracy:

| Level | How it works | LLM calls |
|-------|-------------|----------|
| **Rule routing** | Matches `triggerHint` keywords against the query | 0 |
| **LLM routing** | Sends all skill descriptions to the LLM for intent classification | 1 |

Rule routing runs first. If no keyword matches, the LLM router takes over.

```ts
import { SkillLoader, SkillRunner } from "@agenticforge/skills";

// A personal assistant with multiple capabilities
const skills = await SkillLoader.fromDirectory("./skills");
const runner = new SkillRunner({
  llm,
  skills: [...skills, new StockSkill(), new CalendarSkill()],
  fallbackPrompt: "You are a helpful general assistant.", // used when no skill matches
});

// Each query is routed automatically
await runner.run("What's the weather in Berlin tomorrow?");     // => weather skill
await runner.run("Review my TypeScript function above.");       // => code-reviewer skill
await runner.run("What is Tesla's current stock price?");       // => StockSkill
await runner.run("Schedule a meeting for Friday at 3pm.");      // => CalendarSkill

// Skip routing and call a specific skill directly
await runner.runSkill("stock-query", "AAPL vs MSFT performance this week");
```

---

## Advanced: SkillDispatcher

If you need routing without a full `SkillRunner`, use `SkillDispatcher` directly:

```ts
import { SkillDispatcher, SkillRegistry } from "@agenticforge/skills";

const registry = new SkillRegistry();
registry.register(weatherSkill);
registry.register(stockSkill);
registry.register(codeReviewerSkill);

const dispatcher = new SkillDispatcher(registry, llm);

// Returns the matched skill, or undefined if nothing matched
const skill = await dispatcher.dispatch("Is it going to rain in Tokyo?");
if (skill) {
  const result = await skill.execute({ query }, llm);
}
```

**SkillDispatcher options:**

| Option | Default | Description |
|--------|---------|-------------|
| `routerPromptTemplate` | Built-in prompt | Custom routing prompt with `{skills}` and `{query}` placeholders |
| `triggerHintSeparator` | `/[,，、]/` | Regex to split `triggerHint` into individual keywords |
| `disableRuleRouting` | `false` | Skip keyword matching, always use LLM routing |

---

## Skill File Naming

`SkillLoader` picks up:
- `SKILL.md` — recommended, mirrors Cursor / Claude skills layout
- `*.skill.md` — alternative flat naming

Other `.md` files (`README.md`, `examples.md`, etc.) are ignored.

---

## API Reference

### `SkillRunner`

| Method | Description |
|--------|-------------|
| `run(query, options?)` | Route query to best skill and execute |
| `runSkill(name, query, options?)` | Execute a named skill directly (bypasses routing) |
| `addSkill(skill)` | Register a skill at runtime |
| `removeSkill(name)` | Unregister a skill |
| `listSkills()` | List all registered skill names |

### `AgentSkill`

| Member | Description |
|--------|-------------|
| `name` | Unique skill identifier used for routing and direct calls |
| `description` | One-line summary — this is what the LLM reads to make routing decisions |
| `triggerHint` | Keywords for rule routing (comma-separated) |
| `systemPrompt` | System prompt injected at execution time |
| `tools` | Tools available exclusively to this skill |
| `execute(ctx, llm)` | Override to implement custom execution logic |

### `SkillLoader`

| Method | Description |
|--------|-------------|
| `fromDirectory(dir)` | Scan recursively for `SKILL.md` and `*.skill.md` files |
| `fromFiles(paths[])` | Load from explicit file paths |
| `fromSources(sources[])` | Parse from raw markdown strings (useful for testing) |
| `registryFromDirectory(dir)` | `fromDirectory` + wrap in `SkillRegistry` in one call |

### `SkillRegistry`

| Method | Description |
|--------|-------------|
| `register(skill)` | Add a skill |
| `get(name)` | Look up by name |
| `list()` | All registered skill names |
| `visible()` | Skills visible to the LLM router (`visible: true`) |
| `describeAll()` | Formatted skill list for use in routing prompts |

---

## Using with SkillAgent

For a stateful agent experience with conversation history and structured output, use `SkillAgent` from `@agenticforge/agents`:

```ts
import { SkillAgent } from "@agenticforge/agents";
import { SkillLoader } from "@agenticforge/skills";

const skills = await SkillLoader.fromDirectory("./skills");

const agent = new SkillAgent({
  name: "personal-assistant",
  llm,
  skills,
});

// Conversation history is automatically maintained between calls
await agent.run("What's the weather in London?");
await agent.run("And in Tokyo?");          // knows context from previous turn
await agent.run("Which city is warmer?"); // routes to weather skill again

agent.clearHistory(); // reset between sessions
```

---

## Links

- [GitHub](https://github.com/LittleBlacky/AgenticFORGE/tree/main/packages/skills)
- [npm](https://www.npmjs.com/package/@agenticforge/skills)
- [Root README](https://github.com/LittleBlacky/AgenticFORGE)
