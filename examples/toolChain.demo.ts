import "dotenv/config";
import {ToolRegistry} from "../src/tools/ToolRegistry";
import {ToolChain, ToolChainManager} from "../src/tools/ToolChain";
import * as readline from "node:readline/promises";
import {stdin as input, stdout as output} from "node:process";

async function main() {
  const registry = new ToolRegistry();

  registry.registerFunction(
    "search",
    "根据问题返回模拟搜索结果文本",
    ({input}: {input?: string}) => {
      const question = String(input ?? "").trim();
      if (!question) {
        return "未提供问题";
      }

      return [
        `问题: ${question}`,
        "候选信息: 2024年营收约 128，2023年营收约 96",
        "建议: 计算同比增长率=(今年-去年)/去年*100",
      ].join("\n");
    },
  );

  registry.registerFunction(
    "extract_growth_expr",
    "从搜索结果中提取同比增长率计算表达式",
    ({input}: {input?: string}) => {
      const text = String(input ?? "");
      const nums = text.match(/\d+(?:\.\d+)?/g) ?? [];

      if (nums.length < 2) {
        return "0";
      }

      const current = Number(nums[nums.length - 2]);
      const previous = Number(nums[nums.length - 1]);
      if (previous === 0) {
        return "0";
      }

      // 约定传递给 calculator 的表达式
      return `(${current} - ${previous}) / ${previous} * 100`;
    },
  );

  registry.registerFunction(
    "my_calculator",
    "计算简单算术表达式（支持括号和四则运算）",
    ({input}: {input?: string}) => {
      const expression = String(input ?? "").trim();
      if (!expression) {
        return "0";
      }

      // demo 场景下的简易白名单校验
      if (!/^[0-9+\-*/().\s]+$/.test(expression)) {
        return "表达式包含非法字符";
      }

      try {
        const result = Function(`"use strict"; return (${expression});`)();
        if (typeof result !== "number" || Number.isNaN(result)) {
          return "计算失败";
        }
        return String(result);
      } catch {
        return "计算失败";
      }
    },
  );

  registry.registerFunction(
    "summarize",
    "汇总搜索信息、表达式与计算结果",
    ({input}: {input?: string}) => {
      const payload = String(input ?? "");
      return `结论:\n${payload}`;
    },
  );

  const chain = new ToolChain(
    "research_growth_rate",
    "搜索数据并计算同比增长率的多步骤工具链",
  );

  chain.addStep("search", "{input}", "search_result");
  chain.addStep("extract_growth_expr", "{search_result}", "calc_expr");
  chain.addStep("my_calculator", "{calc_expr}", "calc_result");
  chain.addStep(
    "summarize",
    "问题：{input}\n\n搜索结果：{search_result}\n\n计算表达式：{calc_expr}\n\n计算结果：{calc_result}%",
    "final_summary",
  );

  const manager = new ToolChainManager(registry);
  manager.registerChain(chain);

  const rl = readline.createInterface({input, output});

  console.log("\n可用工具链:", manager.listChains().join(", "));
  console.log("示例输入: 请计算该公司 2024 相比 2023 的同比增长率\n");

  while (true) {
    const userInput = await rl.question("请输入问题(回车退出): ");
    if (!userInput.trim()) {
      break;
    }

    const result = await manager.executeChain("research_growth_rate", userInput);
    console.log("\n=== 工具链执行结果 ===");
    console.log(result);
    console.log();
  }

  rl.close();
}

main().catch((error) => {
  console.error("运行失败:", error);
  process.exitCode = 1;
});
