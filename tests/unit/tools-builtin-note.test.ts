/**
 * NoteTool 单元测试
 * 覆盖：CRUD 操作、搜索、摘要、边界条件、atomic write、无效参数
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { NoteTool } from "../../packages/tools-builtin/src/note";

// 使用系统临时目录保证测试隔离
function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "note-tool-test-"));
}

describe("NoteTool — 基础功能", () => {
  let workspace: string;
  let tool: NoteTool;

  beforeEach(() => {
    workspace = tmpDir();
    tool = new NoteTool({ workspace, autoBackup: false });
  });

  afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // getParameters
  // -------------------------------------------------------------------------
  it("getParameters() returns non-empty array", () => {
    const params = tool.getParameters();
    expect(params.length).toBeGreaterThan(0);
    expect(params.find((p) => p.name === "action")?.required).toBe(true);
  });

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------
  it("create 返回成功消息并包含 ID", async () => {
    const result = await tool.run({
      action: "create",
      title: "测试笔记",
      content: "笔记内容",
    });
    expect(result).toContain("✅");
    expect(result).toContain("测试笔记");
  });

  it("create 缺少 title 返回错误", async () => {
    const result = await tool.run({ action: "create", content: "内容" });
    expect(result).toContain("❌");
  });

  it("create 缺少 content 返回错误", async () => {
    const result = await tool.run({ action: "create", title: "标题" });
    expect(result).toContain("❌");
  });

  it("create 使用指定 note_type", async () => {
    const result = await tool.run({
      action: "create",
      title: "任务",
      content: "任务内容",
      note_type: "task_state",
    });
    expect(result).toContain("task_state");
  });

  it("create 使用 tags 数组", async () => {
    const result = await tool.run({
      action: "create",
      title: "Tagged",
      content: "内容",
      tags: ["tag1", "tag2"],
    });
    expect(result).toContain("✅");
  });

  it("create 达到 maxNotes 限制时返回错误", async () => {
    const smallTool = new NoteTool({ workspace, maxNotes: 1, autoBackup: false });
    await smallTool.run({ action: "create", title: "t1", content: "c1" });
    const result = await smallTool.run({ action: "create", title: "t2", content: "c2" });
    expect(result).toContain("❌");
    expect(result).toContain("上限");
  });

  // -------------------------------------------------------------------------
  // read
  // -------------------------------------------------------------------------
  it("read 返回笔记详情", async () => {
    const createResult = await tool.run({
      action: "create",
      title: "阅读测试",
      content: "阅读内容",
    });
    // 从创建结果中提取 ID
    const idMatch = createResult.match(/ID: (note_\S+)/);
    expect(idMatch).not.toBeNull();
    const noteId = idMatch![1]!;

    const readResult = await tool.run({ action: "read", note_id: noteId });
    expect(readResult).toContain("阅读测试");
    expect(readResult).toContain("阅读内容");
  });

  it("read 缺少 note_id 返回错误", async () => {
    const result = await tool.run({ action: "read" });
    expect(result).toContain("❌");
  });

  it("read 不存在的笔记返回错误", async () => {
    const result = await tool.run({ action: "read", note_id: "note_nonexistent" });
    expect(result).toContain("❌");
  });

  // -------------------------------------------------------------------------
  // update
  // -------------------------------------------------------------------------
  it("update 成功修改笔记内容", async () => {
    const createResult = await tool.run({
      action: "create",
      title: "原标题",
      content: "原内容",
    });
    const idMatch = createResult.match(/ID: (note_\S+)/);
    const noteId = idMatch![1]!;

    const updateResult = await tool.run({
      action: "update",
      note_id: noteId,
      title: "新标题",
      content: "新内容",
    });
    expect(updateResult).toContain("✅");

    const readResult = await tool.run({ action: "read", note_id: noteId });
    expect(readResult).toContain("新标题");
    expect(readResult).toContain("新内容");
  });

  it("update 缺少 note_id 返回错误", async () => {
    const result = await tool.run({ action: "update", content: "内容" });
    expect(result).toContain("❌");
  });

  it("update 不存在的笔记返回错误", async () => {
    const result = await tool.run({
      action: "update",
      note_id: "note_nonexistent",
      content: "内容",
    });
    expect(result).toContain("❌");
  });

  it("update 可以修改 note_type 和 tags", async () => {
    const createResult = await tool.run({ action: "create", title: "t", content: "c" });
    const idMatch = createResult.match(/ID: (note_\S+)/);
    const noteId = idMatch![1]!;

    await tool.run({
      action: "update",
      note_id: noteId,
      note_type: "conclusion",
      tags: ["updated-tag"],
    });
    const listResult = await tool.run({ action: "list" });
    expect(listResult).toContain("conclusion");
  });

  // -------------------------------------------------------------------------
  // delete
  // -------------------------------------------------------------------------
  it("delete 删除笔记后无法读取", async () => {
    const createResult = await tool.run({ action: "create", title: "del", content: "del" });
    const idMatch = createResult.match(/ID: (note_\S+)/);
    const noteId = idMatch![1]!;

    await tool.run({ action: "delete", note_id: noteId });
    const readResult = await tool.run({ action: "read", note_id: noteId });
    expect(readResult).toContain("❌");
  });

  it("delete 缺少 note_id 返回错误", async () => {
    const result = await tool.run({ action: "delete" });
    expect(result).toContain("❌");
  });

  it("delete 不存在的笔记返回错误", async () => {
    const result = await tool.run({ action: "delete", note_id: "note_nonexistent" });
    expect(result).toContain("❌");
  });

  // -------------------------------------------------------------------------
  // list
  // -------------------------------------------------------------------------
  it("list 空时返回提示", async () => {
    const result = await tool.run({ action: "list" });
    expect(result).toContain("暂无笔记");
  });

  it("list 返回已创建的笔记", async () => {
    await tool.run({ action: "create", title: "列表测试", content: "内容" });
    const result = await tool.run({ action: "list" });
    expect(result).toContain("列表测试");
  });

  it("list 按类型过滤", async () => {
    await tool.run({
      action: "create",
      title: "任务笔记",
      content: "内容",
      note_type: "task_state",
    });
    await tool.run({
      action: "create",
      title: "结论笔记",
      content: "内容",
      note_type: "conclusion",
    });
    const result = await tool.run({ action: "list", note_type: "task_state" });
    expect(result).toContain("任务笔记");
    expect(result).not.toContain("结论笔记");
  });

  it("list 支持 limit 参数", async () => {
    await tool.run({ action: "create", title: "A", content: "a" });
    await tool.run({ action: "create", title: "B", content: "b" });
    await tool.run({ action: "create", title: "C", content: "c" });
    const result = await tool.run({ action: "list", limit: 2 });
    // 只显示前2条
    const matches = (result.match(/ID:/g) ?? []).length;
    expect(matches).toBeLessThanOrEqual(2);
  });

  // -------------------------------------------------------------------------
  // search
  // -------------------------------------------------------------------------
  it("search 找到匹配笔记", async () => {
    await tool.run({ action: "create", title: "技术笔记", content: "TypeScript 很好用" });
    const result = await tool.run({ action: "search", query: "TypeScript" });
    expect(result).toContain("技术笔记");
  });

  it("search 未找到时返回提示", async () => {
    const result = await tool.run({ action: "search", query: "不存在的关键词xyz" });
    expect(result).toContain("未找到");
  });

  it("search 缺少 query 返回错误", async () => {
    const result = await tool.run({ action: "search" });
    expect(result).toContain("❌");
  });

  it("search 可以匹配 tags", async () => {
    await tool.run({
      action: "create",
      title: "标签笔记",
      content: "内容",
      tags: ["special-tag"],
    });
    const result = await tool.run({ action: "search", query: "special-tag" });
    expect(result).toContain("标签笔记");
  });

  // -------------------------------------------------------------------------
  // summary
  // -------------------------------------------------------------------------
  it("summary 返回统计信息", async () => {
    await tool.run({ action: "create", title: "笔记1", content: "内容1" });
    await tool.run({ action: "create", title: "笔记2", content: "内容2", note_type: "conclusion" });
    const result = await tool.run({ action: "summary" });
    expect(result).toContain("笔记摘要");
    expect(result).toContain("2");
  });

  it("summary 空笔记返回 0", async () => {
    const result = await tool.run({ action: "summary" });
    expect(result).toContain("0");
  });

  // -------------------------------------------------------------------------
  // 无效操作
  // -------------------------------------------------------------------------
  it("不支持的 action 返回错误", async () => {
    const result = await tool.run({ action: "invalid_action" });
    expect(result).toContain("不支持的操作");
  });

  it("缺少必需的 action 参数返回失败", async () => {
    const result = await tool.run({ title: "t" });
    expect(result).toContain("❌");
  });
});

describe("NoteTool — autoBackup", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = tmpDir();
  });

  afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  it("autoBackup=true 时创建 .bak 文件", async () => {
    const tool = new NoteTool({ workspace, autoBackup: true });
    await tool.run({ action: "create", title: "备份测试", content: "内容" });
    const backupFile = path.join(workspace, "notes_index.json.bak");
    expect(fs.existsSync(backupFile)).toBe(true);
  });

  it("autoBackup=false 时不创建 .bak 文件", async () => {
    const tool = new NoteTool({ workspace, autoBackup: false });
    await tool.run({ action: "create", title: "无备份", content: "内容" });
    const backupFile = path.join(workspace, "notes_index.json.bak");
    expect(fs.existsSync(backupFile)).toBe(false);
  });
});

describe("NoteTool — enableAtomicNoteWrites", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = tmpDir();
  });

  afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  it("enableAtomicNoteWrites=true 时也能正确写入", async () => {
    const tool = new NoteTool({ workspace, enableAtomicNoteWrites: true, autoBackup: false });
    const createResult = await tool.run({
      action: "create",
      title: "原子写入",
      content: "内容",
    });
    expect(createResult).toContain("✅");
    const idMatch = createResult.match(/ID: (note_\S+)/);
    const noteId = idMatch![1]!;
    const readResult = await tool.run({ action: "read", note_id: noteId });
    expect(readResult).toContain("原子写入");
  });
});

describe("NoteTool — 从已有 index 加载", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = tmpDir();
  });

  afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  it("重新创建 NoteTool 时加载已有索引", async () => {
    // 第一个 NoteTool 实例创建笔记
    const tool1 = new NoteTool({ workspace, autoBackup: false });
    await tool1.run({ action: "create", title: "持久化测试", content: "内容" });

    // 第二个实例加载同一个 workspace
    const tool2 = new NoteTool({ workspace, autoBackup: false });
    const listResult = await tool2.run({ action: "list" });
    expect(listResult).toContain("持久化测试");
  });
});

describe("NoteTool — createNote 直接方法调用", () => {
  let workspace: string;
  let tool: NoteTool;

  beforeEach(() => {
    workspace = tmpDir();
    tool = new NoteTool({ workspace, autoBackup: false });
  });

  afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  it("createNote() 成功创建", async () => {
    const result = await tool.createNote("直接调用", "内容", "reference", ["tag"]);
    expect(result).toContain("✅");
  });

  it("listNotes() 过滤无匹配类型时返回提示", async () => {
    const result = await tool.listNotes("blocker", 10);
    expect(result).toContain("暂无笔记");
  });

  it("searchNotes() 找到笔记", async () => {
    await tool.createNote("搜索目标", "关键词内容", "general", []);
    const result = await tool.searchNotes("关键词");
    expect(result).toContain("搜索目标");
  });

  it("getSummary() 返回摘要", async () => {
    const result = await tool.getSummary();
    expect(result).toContain("摘要");
  });
});
