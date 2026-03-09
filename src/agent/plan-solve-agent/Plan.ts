import {LLMClient} from "../../core/llm";
import type {AgentRuntimeOptions} from "../types";
import type {LLMMessage} from "../../core/types";
import {formatPrompt} from "../../utils";
import {PLAN_PROMPT_TEMPLATE} from "./prompts";

export class Planner {
  constructor(
    private readonly llm: LLMClient,
    private readonly promptTemplate: string = PLAN_PROMPT_TEMPLATE,
  ) {}

  private normalizeSteps(steps: string[]): string[] {
    const unique = new Set<string>();
    const normalized: string[] = [];

    for (const rawStep of steps) {
      const cleaned = String(rawStep)
        .trim()
        .replace(/^[-*\d.\s)]+/, "")
        .replace(/^['"]|['"]$/g, "")
        .trim();

      if (!cleaned) {
        continue;
      }

      if (unique.has(cleaned)) {
        continue;
      }

      unique.add(cleaned);
      normalized.push(cleaned);
    }

    return normalized;
  }

  private tryParseJsonArray(candidate: string): string[] | null {
    try {
      const parsed = JSON.parse(candidate);
      if (!Array.isArray(parsed)) {
        return null;
      }
      return parsed.map((item) => String(item));
    } catch {
      return null;
    }
  }

  private extractCodeBlockContent(text: string): string | null {
    const codeBlockMatch = text.match(/```(?:json|javascript|js|python)?\s*([\s\S]*?)```/i);
    return codeBlockMatch?.[1]?.trim() || null;
  }

  private parsePlan(output: string): {
    plan: string[];
    strategy: string;
    reason?: string;
  } {
    const raw = (output || "").trim();

    if (!raw) {
      return {
        plan: [],
        strategy: "empty-output",
        reason: "模型返回为空字符串",
      };
    }

    const codeBlock = this.extractCodeBlockContent(raw);
    if (codeBlock) {
      const fromCodeBlockJson = this.tryParseJsonArray(codeBlock);
      if (fromCodeBlockJson) {
        return {
          plan: this.normalizeSteps(fromCodeBlockJson),
          strategy: "codeblock-json-array",
        };
      }
    }

    const fromRawJson = this.tryParseJsonArray(raw);
    if (fromRawJson) {
      return {
        plan: this.normalizeSteps(fromRawJson),
        strategy: "raw-json-array",
      };
    }

    const oneLineArray = raw.match(/^\[(.*)\]$/s);
    if (oneLineArray) {
      const fromSplit = oneLineArray[1]
        .split(",")
        .map((part) => part.trim().replace(/^['"]|['"]$/g, ""));

      return {
        plan: this.normalizeSteps(fromSplit),
        strategy: "fallback-one-line-array",
      };
    }

    const fromLines = raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    return {
      plan: this.normalizeSteps(fromLines),
      strategy: "fallback-line-list",
      reason: "未匹配到合法 JSON 数组，按行级列表兜底解析",
    };
  }

  async plan(
    question: string,
    options: AgentRuntimeOptions = {},
  ): Promise<string[]> {
    const planPrompt = formatPrompt(this.promptTemplate, {question});
    const messages: LLMMessage[] = [{role: "user", content: planPrompt}];

    console.log("--- 正在生成计划 ---");
    const output =
      (await this.llm.think(messages, options.temperature ?? 0)) || "";
    console.log(`✅ 计划原始输出:\n${output}`);

    const {plan, strategy, reason} = this.parsePlan(output);

    if (plan.length === 0) {
      console.error("❌ 解析计划失败，返回空计划。", {
        strategy,
        reason: reason ?? "未提取到有效步骤",
      });
      return [];
    }

    console.log(`✅ 计划解析成功（${strategy}），共 ${plan.length} 步。`);
    if (reason) {
      console.log(`ℹ️ 解析说明: ${reason}`);
    }

    return plan;
  }
}
