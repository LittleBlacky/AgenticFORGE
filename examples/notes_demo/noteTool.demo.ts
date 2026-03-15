import {NoteTool} from "../../src/tools/builtin/note";

async function runDemo() {
  const noteTool = new NoteTool({
    workspace: "./notes_demo",
    autoBackup: true,
    maxNotes: 100,
    expandable: true,
  });

  console.log(await noteTool.run({
    action: "create",
    title: "任务状态：ContextBuilder 升级",
    content: "已完成 tokenizer 适配与 MMR 向量相似度接入，待补充文档。",
    note_type: "task_state",
    tags: ["context", "mmr"],
  }));

  console.log(await noteTool.run({
    action: "create",
    title: "结论：LRU 缓存",
    content: "向量缓存改为 LRU，默认容量 256，可配置关闭。",
    note_type: "conclusion",
    tags: ["cache"],
  }));

  const list = await noteTool.run({action: "list", limit: 5});
  console.log(list);

  const search = await noteTool.run({action: "search", query: "LRU", limit: 5});
  console.log(search);

  const summary = await noteTool.run({action: "summary"});
  console.log(summary);
}

runDemo().catch((error) => {
  console.error("NoteTool demo 失败:", error);
  process.exitCode = 1;
});
