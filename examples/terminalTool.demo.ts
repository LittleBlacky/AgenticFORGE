import {TerminalTool} from "../src/tools/builtin/terminal";

async function runDemo() {
  const tool = new TerminalTool({
    workspace: "./",
    osType: "auto",
    timeoutMs: 10_000,
    maxOutputSize: 1024 * 1024,
    allowCd: true,
  });

  console.log(await tool.run({command: "pwd"}));
  console.log(await tool.run({command: "ls"}));
  console.log(await tool.run({command: "cd src"}));
  console.log(await tool.run({command: "pwd"}));
  console.log(await tool.run({command: "ls"}));
  console.log(await tool.run({command: "cd .."}));
  console.log(await tool.run({command: "cat package.json"}));
}

runDemo().catch((error) => {
  console.error("TerminalTool demo 失败:", error);
  process.exitCode = 1;
});
