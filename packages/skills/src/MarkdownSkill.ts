import type { LLMClient } from "@agenticforge/core";
import type { IAgentSkill, SkillContext, SkillResult } from "./types";

// ---------------------------------------------------------------------------
// Frontmatter parser (no external deps)
// ---------------------------------------------------------------------------

export interface SkillFrontmatter {
  name: string;
  description: string;
  triggerHint?: string;
  visible?: boolean;
  /** Any extra frontmatter fields are preserved here */
  [key: string]: unknown;
}

/**
 * Parse YAML-like frontmatter from a markdown string.
 * Supports only simple key: value pairs (no nesting, no arrays).
 * Delimited by `---` at the top of the file.
 */
export function parseFrontmatter(source: string): {
  frontmatter: SkillFrontmatter;
  body: string;
} {
  const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
  const match = source.trim().match(FM_RE);

  if (!match) {
    // No frontmatter — try to infer name from first H1
    const h1 = source.match(/^#\s+(.+)$/m);
    return {
      frontmatter: {
        name: h1 ? slugify(h1[1]!) : "unknown-skill",
        description: h1 ? h1[1]! : "Unnamed skill",
      },
      body: source,
    };
  }

  const [, yamlBlock, body] = match as [string, string, string];
  const frontmatter: Record<string, unknown> = {};

  for (const line of yamlBlock.split(/\r?\n/)) {
    const kv = line.match(/^([\w-]+):\s*(.*)$/);
    if (!kv) continue;
    const [, key, value] = kv as [string, string, string];
    // Booleans
    if (value === "true") {
      frontmatter[key] = true;
      continue;
    }
    if (value === "false") {
      frontmatter[key] = false;
      continue;
    }
    // Unquote strings
    frontmatter[key] = value.replace(/^"|"$/g, "").replace(/^'|'$/g, "").trim();
  }

  if (!frontmatter["name"]) {
    const h1 = body.match(/^#\s+(.+)$/m);
    frontmatter["name"] = h1 ? slugify(h1[1]!) : "unknown-skill";
  }
  if (!frontmatter["description"]) {
    frontmatter["description"] = frontmatter["name"];
  }

  return {
    frontmatter: frontmatter as SkillFrontmatter,
    body: body.trim(),
  };
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ---------------------------------------------------------------------------
// MarkdownSkill
// ---------------------------------------------------------------------------

/**
 * A Skill defined entirely in a Markdown file.
 *
 * The markdown body is injected as the system prompt when the Skill executes,
 * so the LLM "becomes" whatever persona/rules the markdown describes.
 *
 * File format:
 * ```markdown
 * ---
 * name: weather-assistant
 * description: Get real-time weather for any city
 * triggerHint: 当用户询问天气、温度、降雨、风速时
 * ---
 *
 * # Weather Assistant
 *
 * ## Role
 * You are a concise weather assistant. Answer only weather-related questions.
 *
 * ## Rules
 * - Always state the city and date in your answer.
 * - If weather data is unavailable, say so clearly.
 * - Do NOT answer non-weather questions.
 * ```
 *
 * Usage:
 * ```ts
 * const skill = MarkdownSkill.fromSource(markdownText);
 * // or
 * const skill = await MarkdownSkill.fromFile("/path/to/skill.md");
 * ```
 */
export class MarkdownSkill implements IAgentSkill {
  readonly name: string;
  readonly description: string;
  readonly triggerHint?: string;
  readonly visible: boolean;
  readonly tools = [] as never[];

  /** The full markdown body used as the system prompt */
  readonly systemPrompt: string;

  /** Raw parsed frontmatter (for inspection) */
  readonly frontmatter: SkillFrontmatter;

  /** Original source file path (if loaded from disk) */
  readonly filePath?: string;

  private constructor(frontmatter: SkillFrontmatter, body: string, filePath?: string) {
    this.frontmatter = frontmatter;
    this.name = frontmatter.name;
    this.description = frontmatter.description;
    this.triggerHint = frontmatter.triggerHint;
    this.visible = frontmatter.visible !== false;
    this.systemPrompt = body;
    this.filePath = filePath;
  }

  // -------------------------------------------------------------------------
  // Factory methods
  // -------------------------------------------------------------------------

  /**
   * Create a MarkdownSkill from a raw markdown string.
   */
  static fromSource(source: string, filePath?: string): MarkdownSkill {
    const { frontmatter, body } = parseFrontmatter(source);
    return new MarkdownSkill(frontmatter, body, filePath);
  }

  /**
   * Load a MarkdownSkill from a file path.
   * Uses Node.js `fs/promises` — only available in Node environments.
   */
  static async fromFile(filePath: string): Promise<MarkdownSkill> {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(filePath, "utf8");
    return MarkdownSkill.fromSource(source, filePath);
  }

  // -------------------------------------------------------------------------
  // IAgentSkill.execute
  // -------------------------------------------------------------------------

  /**
   * Execute the skill: inject the markdown body as system prompt,
   * prepend conversation history, then call the LLM.
   */
  async execute(context: SkillContext, llm: LLMClient): Promise<SkillResult> {
    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: this.systemPrompt },
      ...(context.history ?? []),
      { role: "user", content: context.query },
    ];

    const output = await llm.think(messages);
    return { output };
  }

  // -------------------------------------------------------------------------
  // Describe (for SkillRegistry routing prompt)
  // -------------------------------------------------------------------------

  describe(): string {
    const lines = [`- **${this.name}**: ${this.description}`];
    if (this.triggerHint) lines.push(`  触发条件：${this.triggerHint}`);
    return lines.join("\n");
  }
}
