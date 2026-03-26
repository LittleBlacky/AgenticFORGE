import { Message } from "@agenticforge/core";
import type { Agent } from "@agenticforge/core";
import { SkillRegistry, SkillDispatcher, SkillLoader } from "@agenticforge/skills";
import type { IAgentSkill, SkillContext, SkillDispatcherOptions } from "@agenticforge/skills";

// ---------------------------------------------------------------------------
// withSkills — Mixin：为任意 Agent 子类叠加 Skill 路由层
// ---------------------------------------------------------------------------

/** 有具体 run() 实现的 Agent 构造函数类型（非抽象） */
export type ConcreteAgentConstructor<T extends Agent = Agent> = (new (...args: any[]) => T) & {
  prototype: T & { run: (inputText: string, ...args: unknown[]) => Promise<string> };
};

/** withSkills mixin 注入的 Skill 管理接口 */
export interface WithSkillsInterface {
  readonly skillRegistry: SkillRegistry;
  addSkill(skill: IAgentSkill): void;
  removeSkill(name: string): boolean;
  listSkills(): string[];
  loadSkillsFromDir(dir: string): Promise<void>;
  getDispatcher(): SkillDispatcher;
}

// 用 WeakMap 存储每个实例的私有状态，避免匿名类的 private 导出报错
const _dispatchers = new WeakMap<object, SkillDispatcher>();
const _inDispatch = new WeakMap<object, boolean>();

/**
 * Mixin：在任意 Agent 子类上叠加 Skill 路由层。
 *
 * Skill 路由层**优先**于原有的 Tool/LLM 执行逻辑：
 * - 命中 Skill → `Skill.execute()` → 返回
 * - 未命中 → 走原始 Agent 的 `run()` 逻辑（Tool / LLM）
 *
 * @example
 * ```ts
 * import { ReActAgent, withSkills } from "@agenticforge/agents";
 *
 * const ReactWithSkills = withSkills(ReActAgent);
 * const agent = new ReactWithSkills({ name: "agent", llm, tools: [searchTool] });
 * agent.addSkill(weatherSkill);
 *
 * // 天气问题 → weatherSkill（Skill 层）
 * // 复杂推理 → ReAct 循环（Tool 层）
 * await agent.run("东京今天天气如何？");
 * ```
 */
export function withSkills<TBase extends ConcreteAgentConstructor>(
  Base: TBase,
  dispatcherOptions: SkillDispatcherOptions = {},
): TBase & (new (...args: any[]) => InstanceType<TBase> & WithSkillsInterface) {
  class SkillMixin {
    readonly skillRegistry = new SkillRegistry();

    addSkill(skill: IAgentSkill): void {
      (this as unknown as SkillMixin).skillRegistry.register(skill);
    }

    removeSkill(name: string): boolean {
      return (this as unknown as SkillMixin).skillRegistry.unregister(name);
    }

    listSkills(): string[] {
      return (this as unknown as SkillMixin).skillRegistry.list();
    }

    async loadSkillsFromDir(dir: string): Promise<void> {
      const skills = await SkillLoader.fromDirectory(dir);
      for (const skill of skills) (this as unknown as SkillMixin).skillRegistry.register(skill);
    }

    getDispatcher(): SkillDispatcher {
      let d = _dispatchers.get(this as object);
      if (!d) {
        const agent = this as unknown as { llm: Agent["llm"] };
        d = new SkillDispatcher(
          (this as unknown as SkillMixin).skillRegistry,
          agent.llm,
          dispatcherOptions,
        );
        _dispatchers.set(this as object, d);
      }
      return d;
    }

    async run(inputText: string, ...args: unknown[]): Promise<string> {
      if (!_inDispatch.get(this as object)) {
        _inDispatch.set(this as object, true);
        let skill: IAgentSkill | undefined;
        try {
          skill = await (this as unknown as SkillMixin).getDispatcher().dispatch(inputText);
        } finally {
          _inDispatch.set(this as object, false);
        }

        if (skill) {
          const agent = this as unknown as {
            llm: Agent["llm"];
            history: Agent["history"];
            addMessage: Agent["addMessage"];
          };
          const context: SkillContext = {
            query: inputText,
            history: agent.history.map((m) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
            })),
          };
          const result = await skill.execute(context, agent.llm);
          agent.addMessage(new Message({ role: "user", content: inputText }));
          agent.addMessage(new Message({ role: "assistant", content: result.output }));
          return result.output;
        }
      }

      // 未命中 → 调用原始 Base.run
      return (
        Base.prototype.run as (this: unknown, input: string, ...a: unknown[]) => Promise<string>
      ).call(this, inputText, ...args);
    }
  }

  // 手动合并原型链
  const proto = Base.prototype as unknown as Record<string, unknown>;
  const mixinProto = SkillMixin.prototype as unknown as Record<string, unknown>;
  for (const key of Object.getOwnPropertyNames(mixinProto)) {
    if (key === "constructor") continue;
    Object.defineProperty(proto, key, Object.getOwnPropertyDescriptor(mixinProto, key)!);
  }

  // 注入 skillRegistry 初始化到构造函数
  const OriginalBase = Base as unknown as { new (...args: any[]): any };
  class Enhanced extends OriginalBase {
    constructor(...args: any[]) {
      super(...args);
      // skillRegistry 在 SkillMixin 原型上已经是 getter，这里直接赋值到实例
      (this as any).skillRegistry = new SkillRegistry();
    }
  }

  // 把 SkillMixin 的方法拷贝到 Enhanced.prototype
  for (const key of Object.getOwnPropertyNames(SkillMixin.prototype)) {
    if (key === "constructor") continue;
    Object.defineProperty(
      Enhanced.prototype,
      key,
      Object.getOwnPropertyDescriptor(SkillMixin.prototype, key)!,
    );
  }

  return Enhanced as unknown as TBase &
    (new (...args: any[]) => InstanceType<TBase> & WithSkillsInterface);
}

/** withSkills mixin 返回的实例类型 */
export type SkillEnhancedAgent<TBase extends ConcreteAgentConstructor> = InstanceType<TBase> &
  WithSkillsInterface;
