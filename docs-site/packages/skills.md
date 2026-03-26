# @agenticforge/skills

[![npm](https://img.shields.io/npm/v/@agenticforge/skills)](https://www.npmjs.com/package/@agenticforge/skills)

Composable, routable Agent Skills — define capabilities in Markdown files or TypeScript classes, and let the agent automatically route to the right one.

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
| `MarkdownSkill` | Skill loaded from a `.md` file |
| `SkillLoader` | Directory scanner — loads all `SKILL.md` files |
| `parseFrontmatter` | Low-level frontmatter parser (no external deps) |

See the [Skills Guide](/guide/skills) for detailed usage and examples.
