# @agenticforge/skills

[![npm](https://img.shields.io/npm/v/@agenticforge/skills)](https://www.npmjs.com/package/@agenticforge/skills)

可组合、可路由的 Agent Skills 系统 —— 用 Markdown 文件或 TypeScript 类定义能力单元，让 Agent 自动路由到最合适的 Skill。

## 安装

```bash
npm install @agenticforge/skills
```

## 导出内容

| 导出 | 说明 |
|------|------|
| `AgentSkill` | 可继承的 Skill 基类，内置工具调用循环 |
| `SkillRegistry` | Skill 注册中心与路由描述生成器 |
| `SkillRunner` | 框架无关的 Skill 调度器 |
| `MarkdownSkill` | 从 `.md` 文件加载的 Skill |
| `SkillLoader` | 目录扫描器，加载所有 `SKILL.md` 文件 |
| `parseFrontmatter` | 底层 frontmatter 解析器（无外部依赖） |

详细用法与示例请参见 [Skills 指南](/zh/guide/skills)。
