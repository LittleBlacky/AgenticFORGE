import type { ToolRegistry } from "./ToolRegistry";

// ---------------------------------------------------------------------------
// ToolChain step definition
// ---------------------------------------------------------------------------

export interface ToolChainStep {
  /** Name of the tool/function to call */
  toolName: string;
  /** Input template string; use {variableName} to reference context variables */
  inputTemplate: string;
  /** Key under which the step output is stored in context */
  outputKey: string;
}

// ---------------------------------------------------------------------------
// ToolChain
// ---------------------------------------------------------------------------

/**
 * A sequential chain of tool steps.
 * Each step can reference outputs of prior steps via `{key}` placeholders.
 *
 * ```ts
 * const chain = new ToolChain("my_chain", "Does X then Y");
 * chain.addStep("search", "{input}", "search_result");
 * chain.addStep("summarize", "{search_result}", "summary");
 * ```
 */
export class ToolChain {
  readonly name: string;
  readonly description: string;
  private readonly steps: ToolChainStep[] = [];

  constructor(name: string, description: string) {
    this.name = name;
    this.description = description;
  }

  addStep(toolName: string, inputTemplate: string, outputKey: string): this {
    this.steps.push({ toolName, inputTemplate, outputKey });
    return this;
  }

  getSteps(): ToolChainStep[] {
    return [...this.steps];
  }

  /**
   * Execute the chain against a registry.
   * @param registry  ToolRegistry that holds the referenced tools.
   * @param input     Initial `{input}` value.
   * @returns         The value stored under the last step's outputKey.
   */
  async execute(registry: ToolRegistry, input: string): Promise<string> {
    const context: Record<string, string> = { input };

    for (const step of this.steps) {
      const resolvedInput = interpolate(step.inputTemplate, context);
      const result = await registry.execute(step.toolName, { input: resolvedInput });
      context[step.outputKey] = result;
    }

    const lastStep = this.steps[this.steps.length - 1];
    if (!lastStep) return input;
    return context[lastStep.outputKey] ?? input;
  }
}

// ---------------------------------------------------------------------------
// ToolChainManager
// ---------------------------------------------------------------------------

/**
 * Manages multiple named ToolChains and executes them against a shared registry.
 */
export class ToolChainManager {
  private readonly chains = new Map<string, ToolChain>();
  private readonly registry: ToolRegistry;

  constructor(registry: ToolRegistry) {
    this.registry = registry;
  }

  registerChain(chain: ToolChain): void {
    this.chains.set(chain.name, chain);
  }

  getChain(name: string): ToolChain | undefined {
    return this.chains.get(name);
  }

  listChains(): string[] {
    return Array.from(this.chains.keys());
  }

  async executeChain(chainName: string, input: string): Promise<string> {
    const chain = this.chains.get(chainName);
    if (!chain) throw new Error(`ToolChain not found: ${chainName}`);
    return chain.execute(this.registry, input);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Replace `{key}` placeholders with values from context. */
function interpolate(template: string, context: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    return context[key] ?? `{${key}}`;
  });
}
