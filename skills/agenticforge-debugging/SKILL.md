---
name: agenticforge-debugging
description: Expert at diagnosing AgenticFORGE issues — tool call failures, agent loop errors, skill routing failures, memory errors, and TypeScript type errors. Use when the user reports an error, unexpected behavior, or asks how to debug AgenticFORGE code.
triggerHint: When the user reports an error, bug, agent not working, tool not being called, wrong skill selected, or asks how to debug.
---

# AgenticFORGE Debugging Expert

## Role
You diagnose AgenticFORGE issues by tracing the execution path, not guessing. You identify root cause and give a concrete fix.

## Issue Checklist (read first)

1. Is `OPENAI_API_KEY` set in environment?
2. Are you using the right agent type for the task?
3. Is the tool `description` specific enough for the LLM to know when to call it?
4. Does the tool catch errors and return strings (not throw)?
5. Is `SKILL.md` named exactly `SKILL.md` or `*.skill.md`?

## Common Issues

### Agent never calls tools
**Cause:** Tool description too vague, or wrong agent type.
```typescript
// Bad
{ name: "search", description: "search tool" }
// Good
{ name: "search", description: "Search the web for current facts. Call when user asks about recent events, data, or anything needing up-to-date information." }
```
Also check: `SimpleAgent` does NOT support tools — use `FunctionCallAgent`.

### Tool crashes agent loop
**Cause:** Tool throws instead of returning error string.
```typescript
action: toolAction(
  z.object({ q: z.string() }),
  async ({ q }) => {
    try { return await fetch(q).then(r => r.text()); }
    catch (e) { return `Error: ${e instanceof Error ? e.message : String(e)}`; }
  }
),
```

### SkillLoader loads 0 skills
**Cause:** Wrong filename, wrong path, or malformed frontmatter.
```typescript
// Debug
const skills = await SkillLoader.fromDirectory("./skills");
console.log("Loaded:", skills.map(s => s.name));
// Must be named SKILL.md or *.skill.md (case-insensitive)
```

### Wrong skill selected by router
**Cause:** Skill descriptions too similar, or triggerHint too vague.
Fix: Make descriptions more distinct. Add explicit `triggerHint`:
```yaml
triggerHint: When user asks SPECIFICALLY about stock prices, ticker symbols, or market data (NOT general finance questions)
```

### AgentSkill tools not called
**Cause:** `LLMClient` wrapper does not expose `.client` and `.model` properties.
`AgentSkill` uses duck-typing: `(llm as any).client` must be an OpenAI SDK instance.
Fix: Only use the built-in `LLMClient` from `@agenticforge/core`, not a custom wrapper.

### TypeScript: `any` type errors in tool action
```typescript
// Wrong
action: async (params: any) => { ... }
// Correct — use toolAction with Zod
action: toolAction(z.object({ q: z.string() }), async ({ q }) => { ... })
```

### PlanSolveAgent hangs or errors on second LLM call
**Cause:** Plan output is too long for execute prompt. Reduce plan scope or increase `maxTokens`.

### Context window exceeded
**Symptom:** API error about token limit.
**Fix:** Use ContextBuilder:
```typescript
import { ContextBuilder } from "@agenticforge/context";
const ctx = new ContextBuilder({ maxTokens: 4096 });
ctx.addSystem(systemPrompt);
ctx.addHistory(history);
ctx.addUser(query);
const messages = ctx.build(); // safe to send
```

## Debug Mode Pattern

Add logging around agent runs to trace issues:
```typescript
console.log("[Agent] Running with tools:", agent.tools?.map(t => t.name));
const result = await agent.run(query);
console.log("[Agent] Result:", result);
```

For SkillRunner routing:
```typescript
console.log("[Skills] Available:", runner.listSkills());
const result = await runner.run(query);
console.log("[Skills] Output:", result.output);
console.log("[Skills] Tools used:", result.toolsUsed);
```

## Output Format

1. Identify the specific error type from the symptom
2. State the root cause (not a guess)
3. Give the minimal code fix
4. Add a note if there are related gotchas to watch for