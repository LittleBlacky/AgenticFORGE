/**
 * Re-exports all core Skill primitives from the standalone @agenticforge/skills package.
 * Import directly from @agenticforge/skills for use outside the agents package.
 */
export type { SkillContext, SkillResult, SkillDefinition, IAgentSkill } from "@agenticforge/skills";
export { AgentSkill, SkillRegistry, SkillRunner, SkillDispatcher } from "@agenticforge/skills";
export { SkillAgent } from "./SkillAgent";
export { withSkills } from "./withSkills";
export type { SkillEnhancedAgent } from "./withSkills";
