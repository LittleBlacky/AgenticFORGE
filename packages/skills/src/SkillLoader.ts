import { MarkdownSkill } from "./MarkdownSkill";
import type { IAgentSkill } from "./types";
import { SkillRegistry } from "./SkillRegistry";

// ---------------------------------------------------------------------------
// SkillLoader
// ---------------------------------------------------------------------------

/**
 * Scans a directory (or list of paths) for `SKILL.md` / `*.skill.md` files
 * and loads them as `MarkdownSkill` instances.
 *
 * Convention (mirrors Cursor / Claude skills layout):
 * ```
 * skills/
 *   weather/
 *     SKILL.md          ← loaded
 *   stock-query/
 *     SKILL.md          ← loaded
 *     examples.md       ← ignored
 *   my-tool.skill.md    ← loaded (flat layout)
 * ```
 *
 * Example:
 * ```ts
 * // Load all skills from a directory
 * const skills = await SkillLoader.fromDirectory(".cursor/skills");
 *
 * // Or load from explicit file paths
 * const skills = await SkillLoader.fromFiles([
 *   "./skills/weather/SKILL.md",
 *   "./skills/stock/SKILL.md",
 * ]);
 *
 * // Populate a SkillRegistry
 * const registry = SkillLoader.toRegistry(skills);
 * ```
 */
export class SkillLoader {
  /**
   * Load all skills from a directory tree.
   * Matches files named `SKILL.md` or ending with `.skill.md`.
   *
   * @param dir      Absolute or relative path to the skills directory.
   * @param options  `recursive` (default true) — whether to walk subdirectories.
   */
  static async fromDirectory(
    dir: string,
    options: { recursive?: boolean } = {},
  ): Promise<MarkdownSkill[]> {
    const { readdir, stat } = await import("node:fs/promises");
    const { join, resolve } = await import("node:path");

    const recursive = options.recursive ?? true;
    const skills: MarkdownSkill[] = [];
    const absDir = resolve(dir);

    async function walk(current: string): Promise<void> {
      let entries: string[];
      try {
        entries = await readdir(current);
      } catch {
        return; // directory does not exist — skip silently
      }

      for (const entry of entries) {
        const full = join(current, entry);
        let s;
        try {
          s = await stat(full);
        } catch {
          continue;
        }

        if (s.isDirectory()) {
          if (recursive) await walk(full);
          continue;
        }

        if (isSkillFile(entry)) {
          try {
            skills.push(await MarkdownSkill.fromFile(full));
          } catch (e) {
            console.warn(`[SkillLoader] Failed to load ${full}: ${String(e)}`);
          }
        }
      }
    }

    await walk(absDir);
    return skills;
  }

  /**
   * Load skills from an explicit list of file paths.
   */
  static async fromFiles(filePaths: string[]): Promise<MarkdownSkill[]> {
    const { resolve } = await import("node:path");
    const results: MarkdownSkill[] = [];

    for (const fp of filePaths) {
      try {
        results.push(await MarkdownSkill.fromFile(resolve(fp)));
      } catch (e) {
        console.warn(`[SkillLoader] Failed to load ${fp}: ${String(e)}`);
      }
    }

    return results;
  }

  /**
   * Load skills from raw markdown source strings.
   * Useful for testing or browser environments where `fs` is unavailable.
   */
  static fromSources(sources: Array<{ source: string; filePath?: string }>): MarkdownSkill[] {
    return sources.map(({ source, filePath }) => MarkdownSkill.fromSource(source, filePath));
  }

  /**
   * Create a SkillRegistry populated with the given skills.
   * If `existingRegistry` is provided, skills are added to it.
   */
  static toRegistry(skills: IAgentSkill[], existingRegistry?: SkillRegistry): SkillRegistry {
    const registry = existingRegistry ?? new SkillRegistry();
    for (const skill of skills) {
      registry.register(skill);
    }
    return registry;
  }

  /**
   * Convenience: load all skills from a directory AND return a ready registry.
   */
  static async registryFromDirectory(
    dir: string,
    options?: { recursive?: boolean },
  ): Promise<SkillRegistry> {
    const skills = await SkillLoader.fromDirectory(dir, options);
    return SkillLoader.toRegistry(skills);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the filename matches the skill file naming convention.
 * Matches: `SKILL.md`, `*.skill.md`, `skill.md` (case-insensitive)
 */
function isSkillFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return lower === "skill.md" || lower.endsWith(".skill.md");
}
