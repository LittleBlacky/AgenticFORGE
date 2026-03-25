/**
 * @agenticforge/skills — MarkdownSkill, SkillLoader, parseFrontmatter 测试
 */
import { describe, it, expect, vi } from "vitest";
import { MarkdownSkill, parseFrontmatter } from "../../packages/skills/src/MarkdownSkill";
import { SkillLoader } from "../../packages/skills/src/SkillLoader";
import { SkillRegistry } from "../../packages/skills/src/SkillRegistry";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";

function makeMockLLM(response = "llm-output") {
  return {
    think: vi.fn().mockResolvedValue(response),
    streamThink: vi.fn(async function* () { yield response; }),
    client: undefined,
    model: "mock",
  } as any;
}

const SAMPLE_MD = `---
name: weather
description: Get current weather for any city
triggerHint: When user asks about weather
visible: true
---

# Weather Assistant

You are a concise weather assistant.`;

const HIDDEN_MD = `---
name: internal
description: Internal tool
visible: false
---

Internal system prompt.`;

const NO_FRONTMATTER_MD = `# My Skill

This skill has no frontmatter.`;

// ===========================================================================
// parseFrontmatter
// ===========================================================================
describe("parseFrontmatter", () => {
  it("parses name, description, triggerHint, visible from frontmatter", () => {
    const { frontmatter, body } = parseFrontmatter(SAMPLE_MD);
    expect(frontmatter.name).toBe("weather");
    expect(frontmatter.description).toBe("Get current weather for any city");
    expect(frontmatter.triggerHint).toBe("When user asks about weather");
    expect(frontmatter.visible).toBe(true);
    expect(body).toContain("Weather Assistant");
  });

  it("parses visible: false as boolean", () => {
    const { frontmatter } = parseFrontmatter(HIDDEN_MD);
    expect(frontmatter.visible).toBe(false);
  });

  it("falls back to H1 slug when no frontmatter", () => {
    const { frontmatter } = parseFrontmatter(NO_FRONTMATTER_MD);
    expect(frontmatter.name).toBe("my-skill");
    expect(frontmatter.description).toBe("My Skill");
  });

  it("handles missing name in frontmatter using H1", () => {
    const md = `---
description: A skill
---

# Auto Name`;
    const { frontmatter } = parseFrontmatter(md);
    expect(frontmatter.name).toBe("auto-name");
  });

  it("handles quoted string values", () => {
    const md = `---
name: "quoted-name"
description: 'single quoted'
---
body`;
    const { frontmatter } = parseFrontmatter(md);
    expect(frontmatter.name).toBe("quoted-name");
    expect(frontmatter.description).toBe("single quoted");
  });
});

// ===========================================================================
// MarkdownSkill
// ===========================================================================
describe("MarkdownSkill", () => {
  it("fromSource() creates skill with correct fields", () => {
    const skill = MarkdownSkill.fromSource(SAMPLE_MD, "/path/to/SKILL.md");
    expect(skill.name).toBe("weather");
    expect(skill.description).toBe("Get current weather for any city");
    expect(skill.triggerHint).toBe("When user asks about weather");
    expect(skill.visible).toBe(true);
    expect(skill.filePath).toBe("/path/to/SKILL.md");
    expect(skill.systemPrompt).toContain("Weather Assistant");
    expect(skill.tools).toHaveLength(0);
  });

  it("fromSource() with visible: false sets visible to false", () => {
    const skill = MarkdownSkill.fromSource(HIDDEN_MD);
    expect(skill.visible).toBe(false);
  });

  it("fromSource() without frontmatter still creates skill", () => {
    const skill = MarkdownSkill.fromSource(NO_FRONTMATTER_MD);
    expect(skill.name).toBe("my-skill");
  });

  it("execute() calls llm.think with system prompt and query", async () => {
    const llm = makeMockLLM("sunny");
    const skill = MarkdownSkill.fromSource(SAMPLE_MD);
    const result = await skill.execute({ query: "Tokyo weather?" }, llm);
    expect(result.output).toBe("sunny");
    expect(llm.think).toHaveBeenCalledOnce();
    const msgs = llm.think.mock.calls[0][0];
    expect(msgs[0].role).toBe("system");
    expect(msgs[msgs.length - 1].role).toBe("user");
    expect(msgs[msgs.length - 1].content).toBe("Tokyo weather?");
  });

  it("execute() includes conversation history", async () => {
    const llm = makeMockLLM("ok");
    const skill = MarkdownSkill.fromSource(SAMPLE_MD);
    const result = await skill.execute({
      query: "follow-up",
      history: [{ role: "user", content: "prev" }, { role: "assistant", content: "prev-reply" }],
    }, llm);
    expect(result.output).toBe("ok");
    const msgs = llm.think.mock.calls[0][0];
    expect(msgs.some((m: any) => m.content === "prev")).toBe(true);
  });

  it("describe() returns formatted markdown bullet", () => {
    const skill = MarkdownSkill.fromSource(SAMPLE_MD);
    const desc = skill.describe();
    expect(desc).toContain("weather");
    expect(desc).toContain("Get current weather for any city");
    expect(desc).toContain("When user asks about weather");
  });

  it("describe() without triggerHint omits trigger line", () => {
    const skill = MarkdownSkill.fromSource(HIDDEN_MD);
    const desc = skill.describe();
    expect(desc).not.toContain("触发条件");
  });

  it("fromFile() loads skill from disk", async () => {
    const tmp = path.join(os.tmpdir(), `test-skill-${Date.now()}.md`);
    await fs.writeFile(tmp, SAMPLE_MD, "utf8");
    try {
      const skill = await MarkdownSkill.fromFile(tmp);
      expect(skill.name).toBe("weather");
      expect(skill.filePath).toBe(tmp);
    } finally {
      await fs.unlink(tmp).catch(() => {});
    }
  });
});

// ===========================================================================
// SkillLoader
// ===========================================================================
describe("SkillLoader", () => {
  async function makeTmpSkillDir(): Promise<{ dir: string; cleanup: () => Promise<void> }> {
    const dir = path.join(os.tmpdir(), `skill-loader-test-${Date.now()}`);
    await fs.mkdir(path.join(dir, "weather"), { recursive: true });
    await fs.mkdir(path.join(dir, "stock"), { recursive: true });
    await fs.writeFile(path.join(dir, "weather", "SKILL.md"), SAMPLE_MD, "utf8");
    await fs.writeFile(path.join(dir, "stock", "SKILL.md"),
      `---\nname: stock\ndescription: Stock prices\n---\nStock assistant.`, "utf8");
    await fs.writeFile(path.join(dir, "notes.md"), "# Not a skill", "utf8");
    await fs.writeFile(path.join(dir, "flat.skill.md"),
      `---\nname: flat\ndescription: Flat skill\n---\nFlat.`, "utf8");
    return {
      dir,
      cleanup: async () => { await fs.rm(dir, { recursive: true, force: true }); },
    };
  }

  it("fromDirectory() loads SKILL.md and *.skill.md files", async () => {
    const { dir, cleanup } = await makeTmpSkillDir();
    try {
      const skills = await SkillLoader.fromDirectory(dir);
      const names = skills.map(s => s.name);
      expect(names).toContain("weather");
      expect(names).toContain("stock");
      expect(names).toContain("flat");
      expect(names).not.toContain("not-a-skill");
    } finally { await cleanup(); }
  });

  it("fromDirectory() ignores non-skill .md files", async () => {
    const { dir, cleanup } = await makeTmpSkillDir();
    try {
      const skills = await SkillLoader.fromDirectory(dir);
      expect(skills.every(s => s.name !== "not-a-skill")).toBe(true);
    } finally { await cleanup(); }
  });

  it("fromDirectory() returns empty array for non-existent dir", async () => {
    const skills = await SkillLoader.fromDirectory("/nonexistent/path/xyz");
    expect(skills).toHaveLength(0);
  });

  it("fromDirectory() with recursive: false skips subdirectories", async () => {
    const { dir, cleanup } = await makeTmpSkillDir();
    try {
      const skills = await SkillLoader.fromDirectory(dir, { recursive: false });
      const names = skills.map(s => s.name);
      expect(names).toContain("flat");
      expect(names).not.toContain("weather"); // in subdir
    } finally { await cleanup(); }
  });

  it("fromFiles() loads from explicit paths", async () => {
    const tmp = path.join(os.tmpdir(), `explicit-skill-${Date.now()}.md`);
    await fs.writeFile(tmp, SAMPLE_MD, "utf8");
    try {
      const skills = await SkillLoader.fromFiles([tmp]);
      expect(skills).toHaveLength(1);
      expect(skills[0]!.name).toBe("weather");
    } finally { await fs.unlink(tmp).catch(() => {}); }
  });

  it("fromFiles() skips invalid paths with warning", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const skills = await SkillLoader.fromFiles(["/nonexistent/skill.md"]);
    expect(skills).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("fromSources() creates skills from raw strings", () => {
    const skills = SkillLoader.fromSources([
      { source: SAMPLE_MD, filePath: "weather.md" },
      { source: HIDDEN_MD },
    ]);
    expect(skills).toHaveLength(2);
    expect(skills[0]!.name).toBe("weather");
    expect(skills[1]!.name).toBe("internal");
  });

  it("toRegistry() populates SkillRegistry", () => {
    const skills = SkillLoader.fromSources([{ source: SAMPLE_MD }]);
    const registry = SkillLoader.toRegistry(skills);
    expect(registry).toBeInstanceOf(SkillRegistry);
    expect(registry.has("weather")).toBe(true);
  });

  it("toRegistry() merges into existing registry", () => {
    const existing = new SkillRegistry();
    const skills = SkillLoader.fromSources([{ source: SAMPLE_MD }]);
    SkillLoader.toRegistry(skills, existing);
    expect(existing.has("weather")).toBe(true);
  });

  it("registryFromDirectory() returns populated registry", async () => {
    const { dir, cleanup } = await makeTmpSkillDir();
    try {
      const registry = await SkillLoader.registryFromDirectory(dir);
      expect(registry).toBeInstanceOf(SkillRegistry);
      expect(registry.has("weather")).toBe(true);
    } finally { await cleanup(); }
  });
});
