import "dotenv/config";
import {z} from "zod";
import {ReActAgent} from "../src/agent/react-agent/ReActAgent";
import {LLMClient} from "../src/core/llm";
import {defineFunctionTool} from "../src/tools/Tool";
import {search} from "../src/tools/builtin/search";
import * as readline from "node:readline/promises";
import {stdin as input, stdout as output} from "node:process";

const searchTool = defineFunctionTool({
  name: "search",
  description: "联网搜索信息并返回摘要",
  schema: z.object({
    input: z.string().min(1).describe("要检索的问题或关键词"),
  }),
  func: async (args) => search(args.input),
});

async function main() {
  const llm = new LLMClient({
    model: process.env.LLM_MODEL,
    apiKey: process.env.LLM_API_KEY,
    baseURL: process.env.LLM_BASE_URL,
  });

  const reactAgent = new ReActAgent({
    name: "react-agent-demo",
    llm,
    tools: [searchTool],
    maxSteps: 5,
  });

  const rl = readline.createInterface({input, output});

  while (true) {
    const question = await rl.question("请输入问题(回车退出): ");
    if (!question.trim()) {
      break;
    }

    const answer = await reactAgent.run(question);
    console.log(`\n最终回答: ${answer}\n`);
  }

  rl.close();
}

main().catch((error) => {
  console.error("运行失败:", error);
  process.exitCode = 1;
});
