import "dotenv/config";
import {Agent} from "../src/core/agent";
import {LLMClient} from "../src/core/llm";
import {PlanSolveAgent} from "../src/agent/plan-solve-agent/PlanSolveAgent";
import * as readline from "node:readline/promises";
import {stdin as input, stdout as output} from "node:process";

async function main() {
  const llmClient = new LLMClient({
    model: process.env.LLM_MODEL_ID,
    apiKey: process.env.LLM_API_KEY,
    baseURL: process.env.LLM_BASE_URL,
  });

  const agent = new PlanSolveAgent({
    name: "PlanSolveAgentDemo",
    llm: llmClient as unknown as Agent["llm"],
  });

  const rl = readline.createInterface({input, output});

  while (true) {
    const question = await rl.question("请输入问题(回车退出): ");
    if (!question.trim()) {
      break;
    }

    const result = await agent.run(question);
    console.log("\n=== 最终结果 ===");
    console.log(result);
  }

  rl.close();
}

main().catch((error) => {
  console.error("运行失败:", error);
  process.exitCode = 1;
});
