# @agenticforge/skills

[![npm](https://img.shields.io/npm/v/@agenticforge/skills)](https://www.npmjs.com/package/@agenticforge/skills)

Composable, routable agent capabilities — define each capability as a focused Skill in Markdown or TypeScript, and let the framework automatically route user queries to the right one.

## Installation

```bash
npm install @agenticforge/skills
```

## Available exports

| Export | Description |
|--------|-------------|
| `AgentSkill` | Extensible Skill base class with built-in tool-call loop |
| `SkillRegistry` | Skill registration and routing description generator |
| `SkillRunner` | Framework-independent skill orchestrator |
| `SkillDispatcher` | Two-level routing engine (rule routing + LLM routing) |
| `MarkdownSkill` | Skill loaded from a `.md` file |
| `SkillLoader` | Directory scanner — loads all `SKILL.md` files |
| `parseFrontmatter` | Low-level frontmatter parser (no external deps) |

See the [Skills Guide](/guide/skills) for detailed usage and examples.
