# Skills

The Skills system lets you decompose agent capabilities into named, self-contained units. Each Skill handles one business domain — and the agent automatically routes each user query to the right one.

## Why Skills?

Traditional agents put everything in a single system prompt. As capabilities grow, that prompt gets longer, harder to maintain, and routing logic ends up scattered in `if/else` chains. Skills solve this by:

- Giving each capability its own focused system prompt and tool set
- Letting non-engineers define new skills by editing a Markdown file
- Two-level routing (rule routing + LLM routing) — no dispatch code needed

## Defining Skills

### Markdown Skills (recommended)

Create a `SKILL.md` file. The frontmatter defines routing metadata; the body becomes the system prompt:

```markdown
---
name: code-reviewer
description: Review TypeScript and JavaScript code for bugs, type safety issues, and performance problems.
triggerHint: When the user asks to review, check, or improve code quality
---

# Code Reviewer

You are a senior TypeScript engineer doing a thorough code review.

## Review checklist
- Type safety: no implicit `any`, proper return types
- Error handling: no unhandled promise rejections
- Performance: unnecessary loops, memory leaks

## Output format
1. **Summary** — one-sentence verdict
2. **Issues** — severity + fix suggestion
3. **Improved code**
```

```ts
import { SkillLoader, SkillRunner } from "@agenticforge/skills";
import { LLMClient } from "@agenticforge/core";

const llm = new LLMClient({ provider: "openai", model: "gpt-4o" });
const skills = await SkillLoader.fromDirectory("./skills");
const runner = new SkillRunner({ llm, skills });

const result = await runner.run(
  "Review this: async function fetchUser(id) { return fetch('/api/' + id).then(r => r.json()); }"
);
console.log(result.output);
```

### TypeScript Skills

```ts
import { AgentSkill } from "@agenticforge/skills";
import type { SkillContext, SkillResult } from "@agenticforge/skills";
import type { LLMClient } from "@agenticforge/core";

class StockSkill extends AgentSkill {
  constructor() {
    super({
      name: "stock-query",
      description: "Look up real-time stock prices and market data for any ticker.",
      triggerHint: "When the user asks about stock prices, market cap, ticker, or trading data",
    });
  }

  override async execute(ctx: SkillContext, llm: LLMClient): Promise<SkillResult> {
    const price = await fetchStockPrice(extractTicker(ctx.query));
    const output = await llm.think([
      { role: "system", content: "Format the stock data as a brief, friendly response." },
      { role: "user",   content: `Data: ${JSON.stringify(price)}\nQuestion: ${ctx.query}` },
    ]);
    return { output };
  }
}
```

## Two-Level Routing

`SkillRunner` and `SkillAgent` use a two-level strategy that balances speed and accuracy:

| Level | How it works | LLM calls |
|-------|-------------|----------|
| **Rule routing** (first) | Matches `triggerHint` keywords against the query | 0 |
| **LLM routing** (fallback) | Sends all skill descriptions to the LLM for intent classification | 1 |

```ts
const runner = new SkillRunner({
  llm,
  skills: [...mdSkills, new StockSkill(), new CalendarSkill()],
  fallbackPrompt: "You are a helpful general assistant.",
});

await runner.run("Weather in Berlin tomorrow?");        // => weather skill (rule match)
await runner.run("Review my TypeScript function.");     // => code-reviewer skill
await runner.run("Tesla stock price?");                 // => StockSkill
await runner.run("Schedule a meeting for Friday 3pm."); // => CalendarSkill

// Bypass routing — call a skill directly
await runner.runSkill("stock-query", "AAPL vs MSFT performance this week");
```

## Advanced: SkillDispatcher

```ts
import { SkillDispatcher, SkillRegistry } from "@agenticforge/skills";

const registry = new SkillRegistry();
registry.register(weatherSkill);
registry.register(stockSkill);

const dispatcher = new SkillDispatcher(registry, llm);
const skill = await dispatcher.dispatch("Is it raining in Tokyo?");
if (skill) {
  const result = await skill.execute({ query }, llm);
}
```

## Using with SkillAgent

```ts
import { SkillAgent } from "@agenticforge/agents";
import { SkillLoader } from "@agenticforge/skills";

const skills = await SkillLoader.fromDirectory("./skills");
const agent = new SkillAgent({ name: "assistant", llm, skills });

// Conversation history is automatically maintained
await agent.run("What's the weather in London?");
await agent.run("And Tokyo?");           // knows context
await agent.run("Which city is warmer?"); // routes to weather skill again

agent.clearHistory();
```

## SkillRunner vs SkillAgent

| | `SkillRunner` | `SkillAgent` |
|---|---|---|
| Package | `@agenticforge/skills` | `@agenticforge/agents` |
| Conversation history | Manual (`options.history`) | Automatic |
| Extends Agent base class | No | Yes |
| Best for | Scripts, API services | Full agent workflows |

## Skill file naming

`SkillLoader` recognizes:
- `SKILL.md` — recommended
- `*.skill.md`

Other `.md` files (`README.md`, `examples.md`) are ignored.
