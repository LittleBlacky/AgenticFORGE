# Skills

The Skills system lets you decompose agent capabilities into named, self-contained units. Each Skill handles one business domain — and the agent automatically routes each user query to the right one.

## Why Skills?

Traditional agents put everything in a single system prompt. As capabilities grow, that prompt gets longer, harder to maintain, and less effective. Skills solve this by:

- Giving each capability its own focused system prompt and tool set
- Letting non-engineers define new skills by editing a Markdown file
- Routing queries automatically — no `if/else` dispatch code needed

## Two ways to define a Skill

| Method | Best For |
|--------|----------|
| **Markdown file** (`SKILL.md`) | Rapid iteration, non-engineer maintainable, Cursor/Claude-style skill dirs |
| **TypeScript class** | Complex logic, custom tool orchestration, programmatic control |

## Markdown Skills

Create a `SKILL.md` file anywhere in your project:

```markdown
---
name: weather
description: Get real-time weather for any city
triggerHint: When the user asks about temperature, rain, wind, or forecasts
---

# Weather Assistant

You are a concise weather assistant. Answer only weather-related questions.

## Rules
- Always include the city name and date in your answer.
- If data is unavailable, say so clearly.
- Do NOT answer non-weather questions.
```

Load and run:

```ts
import { SkillLoader, SkillRunner } from "@agenticforge/skills";
import { LLMClient } from "@agenticforge/core";

const llm = new LLMClient({ provider: "openai", model: "gpt-4o" });

// Recursively scan a directory for SKILL.md files
const registry = await SkillLoader.registryFromDirectory(".cursor/skills");

const runner = new SkillRunner({ llm, skills: registry.all() });
const result = await runner.run("Is it raining in Tokyo today?");
console.log(result.output);
```

## TypeScript Skills

### Instantiate directly

```ts
import { AgentSkill, SkillRunner } from "@agenticforge/skills";
import { LLMClient } from "@agenticforge/core";

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

### Extend the base class

Override `execute()` for fully custom logic:

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

## Auto-routing

When multiple skills are registered, `SkillRunner` uses the LLM to classify the user's intent and dispatch to the best match:

```ts
import { SkillLoader, SkillRunner } from "@agenticforge/skills";

const mdSkills = await SkillLoader.fromDirectory(".cursor/skills");
const codeSkills = [new StockSkill(), new EmailSkill()];

const runner = new SkillRunner({
  llm,
  skills: [...mdSkills, ...codeSkills],
});

await runner.run("What is Apple's stock price?");       // => StockSkill
await runner.run("Is it raining in Tokyo?");             // => weather SKILL.md
await runner.run("Draft a meeting invite for tomorrow"); // => EmailSkill

// Bypass routing — call a skill directly
await runner.runSkill("stock-query", "AAPL price?");
```

## Using with SkillAgent

`SkillAgent` (from `@agenticforge/agents`) extends the `Agent` base class so you get conversation history and the standard `run()` / `streamRun()` lifecycle:

```ts
import { SkillAgent } from "@agenticforge/agents";
import { SkillLoader } from "@agenticforge/skills";
import { LLMClient } from "@agenticforge/core";

const llm = new LLMClient({ provider: "openai", model: "gpt-4o" });
const skills = await SkillLoader.fromDirectory(".cursor/skills");

const agent = new SkillAgent({
  name: "assistant",
  llm,
  skills: [...skills, new StockSkill()],
});

// Auto-routes and tracks conversation history
const reply = await agent.run("Is it raining in Tokyo?");

// Call a specific skill directly
const result = await agent.runSkill("stock-query", "Apple stock price?");
console.log(result.output);
```

## Skill file naming

`SkillLoader` recognizes:
- `SKILL.md` — recommended, works with any subdirectory layout
- `*.skill.md` — for flat layouts

Other `.md` files (`README.md`, `examples.md`) are ignored.

## SkillRunner vs SkillAgent

| | `SkillRunner` | `SkillAgent` |
|---|---|---|
| Package | `@agenticforge/skills` | `@agenticforge/agents` |
| Conversation history | Manual (`options.history`) | Automatic |
| Agent base class | No | Yes (extends `Agent`) |
| Best for | Scripts, API services | Full agent workflows |
