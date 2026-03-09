import "dotenv/config";
import {Agent} from "../src/core/agent";
import {LLMClient} from "../src/core/llm";
import {ReflectionAgent} from "../src/agent/reflection-agent/ReflectionAgent";
import * as readline from "node:readline/promises";
import {stdin as input, stdout as output} from "node:process";

async function main() {
  const llmClient = new LLMClient({
    model: process.env.LLM_MODEL_ID,
    apiKey: process.env.LLM_API_KEY,
    baseURL: process.env.LLM_BASE_URL,
  });

  const agent = new ReflectionAgent({
    name: "ReflectionAgentDemo",
    llm: llmClient as unknown as Agent["llm"],
    maxIterations: 3,
  });

  const rl = readline.createInterface({input, output});

  while (true) {
    const task = await rl.question("请输入任务(回车退出): ");
    if (!task.trim()) {
      break;
    }

    const result = await agent.run(task);
    console.log("\n=== 最终结果 ===");
    console.log(result);
  }

  rl.close();
}

main().catch((error) => {
  console.error("运行失败:", error);
  process.exitCode = 1;
});
