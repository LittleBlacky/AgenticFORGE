export const COT_SYSTEM_PROMPT = `你是一个链式思维（Chain of Thought）推理智能体。
对于每个问题，你必须先逐步拆解思路，再给出最终答案。

推理格式（严格遵守）：
思考步骤 1: <第一步的推理内容>
思考步骤 2: <第二步的推理内容>
思考步骤 3: <第三步的推理内容>
... (根据需要增减步骤)
最终答案: <综合以上推理得出的最终答案>

规则：
- 每个思考步骤必须清晰、具体，逐步推进
- 步骤之间要有逻辑递进关系
- 最终答案必须基于以上思考步骤，简洁明了
- 如果问题简单，可以只用 1-2 个步骤`;

export interface CotStep {
  stepNumber: number;
  content: string;
}

export interface CotParseResult {
  steps: CotStep[];
  finalAnswer: string;
  rawOutput: string;
}

/**
 * 解析 COT 格式输出，提取思考步骤和最终答案。
 */
export function parseCotOutput(raw: string): CotParseResult {
  const steps: CotStep[] = [];

  // 匹配 "思考步骤 N:" 或 "Step N:" 格式
  const stepRegex =
    /(?:思考步骤|Step)\s*(\d+)\s*[:：]\s*([\s\S]*?)(?=(?:思考步骤|Step)\s*\d+\s*[:：]|最终答案\s*[:：]|Final\s+Answer\s*[:：]|$)/gi;

  let match: RegExpExecArray | null;
  while ((match = stepRegex.exec(raw)) !== null) {
    const stepNumber = parseInt(match[1]!, 10);
    const content = match[2]!.trim();
    if (content) {
      steps.push({ stepNumber, content });
    }
  }

  // 匹配最终答案（支持中英文格式）
  const finalMatch = raw.match(/(?:最终答案|Final\s+Answer)\s*[:：]\s*([\s\S]+)$/i);
  const finalAnswer = finalMatch ? finalMatch[1]!.trim() : raw.trim();

  // 如果没有解析到任何步骤，把整个输出作为单步骤
  if (steps.length === 0) {
    steps.push({ stepNumber: 1, content: raw.trim() });
  }

  return { steps, finalAnswer, rawOutput: raw };
}

/**
 * 构建 COT 思考提示词，支持携带历史上下文。
 */
export function buildCotPrompt(question: string, context?: string): string {
  const contextSection = context ? `\n\n背景信息：\n${context}` : "";
  return `${question}${contextSection}\n\n请按照链式思维格式，逐步推理后给出答案。`;
}

/**
 * 构建多轮 COT 对话的系统提示词（携带前几轮推理摘要）。
 */
export function buildCotSystemWithSummary(baseSystem: string, summary: string): string {
  return `${baseSystem}\n\n历史推理摘要：\n${summary}`;
}
