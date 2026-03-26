/**
 * Re-exports all core Skill primitives from the standalone @agenticforge/skills package.
 * Import directly from @agenticforge/skills for use outside the agents package.
 */
export type { SkillContext, SkillResult, SkillDefinition, IAgentSkill } from "@agenticforge/skills";
export { AgentSkill, SkillRegistry, SkillRunner } from "@agenticforge/skills";
