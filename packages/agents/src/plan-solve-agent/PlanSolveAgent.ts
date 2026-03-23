import {Agent} from "@agenticforge/core";
import {Message} from "@agenticforge/core";
import {ToolRegistry} from "@agenticforge/tools";
import {
  type Plan,
  createPlan,
  markStepDone,
  markStepFailed,
  getCompletedResults,
} from "./Plan";
import {buildPlanPrompt, buildFinalPrompt, PLAN_SYSTEM_PROMPT} from "./prompts";
import {StepExecutor} from "./Executor";

export interface PlanSolveAgentOptions {
  name: string;
  llm: Agent["llm"];
  systemPrompt?: string;
  config?: Agent["config"];
  toolRegistry?: ToolRegistry;
  maxSteps?: number;
  verbose?: boolean;
}

/**
 * Plan-and-Solve Agent:
 * 1. Generates a structured plan from the user goal.
 * 2. Executes each step in sequence.
 * 3. Synthesises a final answer from all step results.
 */
export class PlanSolveAgent extends Agent {
  private readonly toolRegistry?: ToolRegistry;
  private readonly maxSteps: number;
  private readonly verbose: boolean;
  private readonly executor: StepExecutor;
  private lastPlan?: Plan;

  constructor(options: PlanSolveAgentOptions) {
    super({
      name: options.name,
      llm: options.llm,
      systemPrompt: options.systemPrompt ?? PLAN_SYSTEM_PROMPT,
      config: options.config,
    });
    this.toolRegistry = options.toolRegistry;
    this.maxSteps = options.maxSteps ?? 10;
    this.verbose = options.verbose ?? false;
    this.executor = new StepExecutor({
      llm: options.llm,
      toolRegistry: options.toolRegistry,
    });
  }

  async run(inputText: string): Promise<string> {
    const traceId = this.createTraceId();
    await this.emitHook("beforeRun", {traceId, inputText, metadata: {mode: "run", agent: "plan-solve"}});

    try {
      const planPrompt = buildPlanPrompt(inputText);
      await this.emitHook("beforeLLMCall", {
        traceId,
        inputText,
        llmRequest: {phase: "plan", planPrompt},
      });
      const planRaw = await this.llm.think([
        {role: "system", content: this.systemPrompt ?? PLAN_SYSTEM_PROMPT},
        {role: "user", content: planPrompt},
      ]);
      await this.emitHook("afterLLMCall", {
        traceId,
        inputText,
        llmResponse: {phase: "plan", planRaw},
      });

      const plan = this.parsePlan(inputText, planRaw);
      this.lastPlan = plan;

      if (this.verbose) {
        console.log(`[PlanSolve] Plan created with ${plan.steps.length} steps`);
      }

      let context = "";
      const steps = plan.steps.slice(0, this.maxSteps);

      for (const step of steps) {
        if (this.verbose) {
          console.log(`[PlanSolve] Executing step ${step.id}: ${step.description}`);
        }
        try {
          await this.emitHook("beforeToolCall", {
            traceId,
            inputText,
            toolName: step.tool ?? "step-executor",
            toolInput: {step, context},
            metadata: {phase: "execute-step"},
          });
          const result = await this.executor.execute(step, context);
          await this.emitHook("afterToolCall", {
            traceId,
            inputText,
            toolName: step.tool ?? "step-executor",
            toolInput: {step, context},
            toolOutput: result,
            metadata: {phase: "execute-step"},
          });
          markStepDone(plan, step.id, result);
          context += `\n步骤${step.id}(${step.description}): ${result}`;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          markStepFailed(plan, step.id, msg);
          context += `\n步骤${step.id}失败: ${msg}`;
        }
      }

      const results = getCompletedResults(plan);
      const finalPrompt = buildFinalPrompt(inputText, results);
      await this.emitHook("beforeLLMCall", {
        traceId,
        inputText,
        llmRequest: {phase: "final", finalPrompt},
      });
      const finalAnswer = await this.llm.think([
        {
          role: "system",
          content: "你是一个综合分析助手，根据执行结果给出清晰的最终答案。",
        },
        {role: "user", content: finalPrompt},
      ]);
      await this.emitHook("afterLLMCall", {
        traceId,
        inputText,
        llmResponse: {phase: "final", finalAnswer},
      });

      this.addMessage(new Message({role: "user", content: inputText}));
      this.addMessage(new Message({role: "assistant", content: finalAnswer}));
      await this.emitHook("afterRun", {traceId, inputText, outputText: finalAnswer, metadata: {mode: "run"}});
      return finalAnswer;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      await this.emitHook("onError", {traceId, inputText, error: err, metadata: {mode: "run"}});
      throw err;
    }
  }

  getLastPlan(): Plan | undefined {
    return this.lastPlan;
  }

  /**
   * Stream the final synthesis answer token by token.
   * Planning and step-execution run non-streaming; only the final
   * "write the report" call is streamed.
   */
  async *streamRun(inputText: string, options?: {temperature?: number}): AsyncGenerator<string> {
    const planPrompt = buildPlanPrompt(inputText);
    const planRaw = await this.llm.think(
      [
        {role: "system", content: this.systemPrompt ?? PLAN_SYSTEM_PROMPT},
        {role: "user", content: planPrompt},
      ],
      options?.temperature,
    );

    const plan = this.parsePlan(inputText, planRaw);
    this.lastPlan = plan;

    if (this.verbose) {
      console.log(`[PlanSolve] Plan created with ${plan.steps.length} steps`);
    }

    let context = "";
    const steps = plan.steps.slice(0, this.maxSteps);

    for (const step of steps) {
      if (this.verbose) {
        console.log(`[PlanSolve] Executing step ${step.id}: ${step.description}`);
      }
      try {
        const result = await this.executor.execute(step, context);
        markStepDone(plan, step.id, result);
        context += `\n步骤${step.id}(${step.description}): ${result}`;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        markStepFailed(plan, step.id, msg);
        context += `\n步骤${step.id}失败: ${msg}`;
      }
    }

    const results = getCompletedResults(plan);
    const finalPrompt = buildFinalPrompt(inputText, results);
    const finalMessages: Array<{role: "system" | "user" | "assistant"; content: string}> = [
      {role: "system", content: "你是一个综合分析助手，根据执行结果给出清晰的最终答案。"},
      {role: "user", content: finalPrompt},
    ];

    let fullResponse = "";
    for await (const chunk of this.llm.streamThink(finalMessages, options?.temperature)) {
      fullResponse += chunk;
      yield chunk;
    }

    this.addMessage(new Message({role: "user", content: inputText}));
    this.addMessage(new Message({role: "assistant", content: fullResponse}));
  }

  private parsePlan(goal: string, raw: string): Plan {
    try {
      const jsonMatch =
        raw.match(/```json\s*([\s\S]*?)\s*```/i) ?? raw.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? (jsonMatch[1] ?? jsonMatch[0]) : raw;
      const parsed = JSON.parse(jsonStr) as {
        goal?: string;
        steps?: Array<{id?: number; description?: string; tool?: string}>;
      };
      const steps = (parsed.steps ?? []).map((s, idx) => ({
        id: s.id ?? idx + 1,
        description: s.description ?? `Step ${idx + 1}`,
        tool: s.tool,
      }));
      return createPlan(goal, steps);
    } catch {
      return createPlan(goal, [{id: 1, description: raw.slice(0, 200)}]);
    }
  }
}
