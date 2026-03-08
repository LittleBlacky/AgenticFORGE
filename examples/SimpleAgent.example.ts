import {SimpleAgent} from "../src/agent/simple-agent/SimpleAgent";
import {LLMClient} from "../src/core/llm";
import {defineFunctionTool} from "../src/tools/Tool";
import {z} from "zod";
import "dotenv/config";

/**
 * 带参数验证的乘法工具（用户手写 schema）
 */
const multiplyTool = defineFunctionTool({
  name: "calculatorMultiply",
  description: "计算两个数字的乘积",
  schema: z.object({
    a: z.number().describe("第一个数字"),
    b: z.number().describe("第二个数字"),
  }),
  func: (args) => {
    return String(args.a * args.b);
  },
});

/**
 * 带参数验证的加法工具（用户手写 schema）
 */
const addTool = defineFunctionTool({
  name: "calculatorAdd",
  description: "计算两个数字的和",
  schema: z.object({
    a: z.number().describe("第一个数字"),
    b: z.number().describe("第二个数字"),
  }),
  func: (args: {b: number; a: number}) => {
    return String(args.a + args.b);
  },
});

const divideTool = defineFunctionTool({
  name: "calculatorDivide",
  description: "计算两个数字的商",
  schema: z.object({
    a: z.number().describe("第一个数字"),
    b: z.number().describe("第二个数字"),
  }),
  func: (args: {b: number; a: number}) => {
    return String(args.a / args.b);
  },
});

const subtractTool = defineFunctionTool({
  name: "calculatorSubtract",
  description: "计算两个数字的差",
  schema: z.object({
    a: z.number().describe("第一个数字"),
    b: z.number().describe("第二个数字"),
  }),
  func: (args: {b: number; a: number}) => {
    return String(args.a - args.b);
  },
});

/**
 * 带工具调用的 demo，支持流式输出
 */
async function demoWithTools(llm: LLMClient) {
  const agent = new SimpleAgent({
    name: "simple-agent-with-tools",
    llm,
    tools: [multiplyTool, addTool, divideTool, subtractTool],
    enableToolCalling: true,
  });

  console.log(await agent.run("请帮我算 12 * 10 + 15 - 3 / 2 是多少"));
  // for await (const chunk of agent.streamRun("请帮我算 12 * 10 + 15 - 3 / 2 是多少")) {
  //   process.stdout.write(chunk); // 控制台逐字输出
  // }
}

/**
 * 结构化输出 demo
 */
async function demoStructuredOutput(llm: LLMClient) {
  const agent = new SimpleAgent({
    name: "simple-agent-structured-output",
    llm,
    enableToolCalling: false,
  });

  const summarySchema = z.object({
    firstNumber: z.number().describe("第一个随机数字"),
    secondNumber: z.number().describe("第二个随机数字"),
    thirdNumber: z.number().describe("第三个随机数字"),
  });

  try {
    const result = await agent.runStructured({
      inputText: "请帮我随机生成三个数字",
      schema: summarySchema,
      maxRetries: 2,
    });
    console.log("结构化输出结果:");
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("结构化输出失败:", error.message);
  }
}

/**
 * 主函数：根据命令行参数选择运行哪个 demo
 */
async function main() {
  const llm = new LLMClient(); // 假设 LLMClient 构造函数无参数或从环境变量读取

  const args = process.argv.slice(2);
  const demoName = args[0] || "all"; // 默认运行所有

  try {
    if (demoName === "tools" || demoName === "all") {
      console.log("=== 运行带工具的 Demo ===");
      await demoWithTools(llm);
    }

    if (demoName === "structured" || demoName === "all") {
      console.log("\n=== 运行结构化输出 Demo ===");
      await demoStructuredOutput(llm);
    }
  } catch (error) {
    console.error("Demo 运行出错:", error);
    process.exitCode = 1;
  } finally {
    // 清理资源（如果 LLMClient 有关闭方法）
    // await llm.close();
  }
}

main();

