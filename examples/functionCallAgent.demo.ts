import "dotenv/config";
import {LLMClient} from "../src/core/llm";
import {FunctionCallAgent} from "../src/agent/function-call-agent/FunctionCallAgent";
import {defineFunctionTool} from "../src/tools/Tool";
import * as readline from "node:readline/promises";
import {stdin as input, stdout as output} from "node:process";

const weatherTool = defineFunctionTool<{city: string}>({
  name: "get_weather",
  description: "根据城市名获取天气信息",
  func: async ({city}) => {
    return `城市 ${city} 的天气：晴，22°C，微风。`;
  },
});

async function main() {
  const llmClient = new LLMClient({
    model: process.env.LLM_MODEL_ID,
    apiKey: process.env.LLM_API_KEY,
    baseURL: process.env.LLM_BASE_URL,
  });

  const agent = new FunctionCallAgent({
    name: "FunctionCallAgentDemo",
    llm: llmClient,
    tools: [weatherTool],
    maxToolIterations: 3,
  });

  const rl = readline.createInterface({input, output});

  while (true) {
    const question = await rl.question("请输入问题(回车退出): ");
    if (!question.trim()) {
      break;
    }

    const result = await agent.run(question);
    console.log("\n=== 最终答案 ===");
    console.log(result);
  }

  rl.close();
}

main().catch((error) => {
  console.error("运行失败:", error);
  process.exitCode = 1;
});
