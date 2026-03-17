export const PLAN_SYSTEM_PROMPT = `你是一个智能规划助手。
给定用户目标，你需要将其分解为清晰的、可执行的步骤列表。

请以JSON格式输出计划，格式如下：
{
  "goal": "用户目标",
  "steps": [
    {"id": 1, "description": "步骤描述", "tool": "可选工具名称"},
    ...
  ]
}`;

export const SOLVE_SYSTEM_PROMPT = `你是一个智能执行助手。
给定一个具体步骤，请执行它并返回结果。
直接给出执行结果，不需要解释过程。`;

export const FINAL_ANSWER_PROMPT = `基于以下步骤执行结果，请综合给出最终答案：`;

export function buildPlanPrompt(goal: string): string {
  return `用户目标：${goal}\n\n请制定详细的执行计划。`;
}

export function buildStepPrompt(stepDescription: string, context: string): string {
  const contextSection = context
    ? `\n\n已有上下文信息：\n${context}`
    : "";
  return `请执行以下步骤：${stepDescription}${contextSection}`;
}

export function buildFinalPrompt(goal: string, results: string[]): string {
  const resultsText = results
    .map((r, i) => `步骤 ${i + 1} 结果：${r}`)
    .join("\n");
  return `${FINAL_ANSWER_PROMPT}\n\n原始目标：${goal}\n\n${resultsText}\n\n请给出综合最终答案。`;
}
