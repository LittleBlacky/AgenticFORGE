# NoteTool 解析文档

## 1. 背景与目标
- **背景**：在 Agent 运行过程中，需要结构化记录任务状态、结论、阻塞项与参考资料。
- **目标**：提供一个可读写的本地笔记系统，支持 CRUD、检索、索引与摘要统计。

## 2. 核心组件与职责
### 2.1 NoteTool
- 统一的工具入口，支持 `create/read/update/delete/list/search/summary`。
- 维护索引文件（`notes_index.json`），并可选自动备份。

```1:93:src/tools/builtin/note.ts
export class NoteTool extends Tool {
  private readonly workspace: string;
  private readonly autoBackup: boolean;
  private readonly maxNotes: number;
  private readonly indexFile: string;
  private notesIndex: NoteIndex;

  constructor(options: NoteToolOptions = {}) {
    super(
      "note",
      "笔记工具 - 创建、读取、更新、删除结构化笔记，支持任务状态、结论、阻塞项等类型",
      options.expandable ?? false,
    );

    this.workspace = options.workspace ?? "./notes";
    this.autoBackup = options.autoBackup ?? true;
    this.maxNotes = options.maxNotes ?? 1000;
    this.indexFile = path.join(this.workspace, "notes_index.json");

    fs.mkdirSync(this.workspace, {recursive: true});
    this.notesIndex = this.loadIndex();
  }
}
```

### 2.2 索引结构
- `NoteIndex` 仅保存轻量元信息（id/title/type/tags/created_at），用于快速列表与搜索入口。

```33:52:src/tools/builtin/note.ts
type NoteIndexRecord = {
  id: string;
  title: string;
  type: NoteType;
  tags: string[];
  created_at: string;
};

type NoteIndex = {
  notes: NoteIndexRecord[];
  metadata: {
    created_at: string;
    total_notes: number;
  };
};
```

## 3. 关键流程（结合代码）
### 3.1 创建笔记（create）
- 校验参数 → 生成 ID → 写入 Markdown → 更新索引。

```145:209:src/tools/builtin/note.ts
  @toolAction("note_create", "创建一条新的结构化笔记")
  async createNote(
    title?: string,
    content?: string,
    noteType: NoteType = "general",
    tags: string[] = [],
  ): Promise<string> {
    if (!title || !content) {
      return "❌ 创建笔记需要提供 title 和 content";
    }

    if (this.notesIndex.notes.length >= this.maxNotes) {
      return `❌ 笔记数量已达上限 (${this.maxNotes})`;
    }

    const noteId = this.generateNoteId();
    const now = new Date().toISOString();
    const note: NoteRecord = {
      id: noteId,
      title,
      content,
      type: noteType,
      tags,
      created_at: now,
      updated_at: now,
      metadata: {
        word_count: content.length,
        status: "active",
      },
    };

    const notePath = this.getNotePath(noteId);
    fs.writeFileSync(notePath, this.noteToMarkdown(note), "utf-8");

    this.notesIndex.notes.push({
      id: noteId,
      title,
      type: noteType,
      tags,
      created_at: now,
    });
    this.notesIndex.metadata.total_notes = this.notesIndex.notes.length;
    this.saveIndex();

    return `✅ 笔记创建成功\nID: ${noteId}\n标题: ${title}\n类型: ${noteType}`;
  }
```

### 3.2 读取/更新/删除
- 读取与更新会解析 Markdown 中的 YAML 前置元数据并回写。

```214:312:src/tools/builtin/note.ts
  @toolAction("note_read", "读取指定ID的笔记")
  async readNote(noteId?: string): Promise<string> {
    if (!noteId) return "❌ 读取笔记需要提供 note_id";
    const notePath = this.getNotePath(noteId);
    if (!fs.existsSync(notePath)) return `❌ 笔记不存在: ${noteId}`;

    const markdownText = fs.readFileSync(notePath, "utf-8");
    const note = this.markdownToNote(markdownText);
    return this.formatNote(note, false);
  }

  @toolAction("note_update", "更新已存在的笔记")
  async updateNote(
    noteId?: string,
    title?: string,
    content?: string,
    noteType?: NoteType,
    tags?: string[],
  ): Promise<string> {
    if (!noteId) return "❌ 更新笔记需要提供 note_id";
    const notePath = this.getNotePath(noteId);
    if (!fs.existsSync(notePath)) return `❌ 笔记不存在: ${noteId}`;

    const markdownText = fs.readFileSync(notePath, "utf-8");
    const note = this.markdownToNote(markdownText);

    if (title) note.title = title;
    if (content) {
      note.content = content;
      note.metadata.word_count = content.length;
    }
    if (noteType) note.type = noteType;
    if (tags) note.tags = tags;
    note.updated_at = new Date().toISOString();

    fs.writeFileSync(notePath, this.noteToMarkdown(note), "utf-8");

    for (const item of this.notesIndex.notes) {
      if (item.id === noteId) {
        item.title = note.title;
        item.type = note.type;
        item.tags = note.tags;
      }
    }

    this.saveIndex();
    return `✅ 笔记更新成功: ${noteId}`;
  }
```

### 3.3 列表/搜索/摘要
- 列表：按类型筛选后分页返回。
- 搜索：遍历索引并读取 Markdown 内容进行关键词匹配。

```313:417:src/tools/builtin/note.ts
  @toolAction("note_list", "列出所有笔记或指定类型的笔记")
  async listNotes(noteType?: NoteType, limit = 10): Promise<string> {
    const filtered = noteType
      ? this.notesIndex.notes.filter((note) => note.type === noteType)
      : this.notesIndex.notes;

    const results = filtered.slice(0, Math.max(1, limit));
    if (!results.length) return "📝 暂无笔记";

    const lines = [`📝 笔记列表（共 ${results.length} 条）`, ""];
    for (const note of results) {
      lines.push(`• [${note.type}] ${note.title}`);
      lines.push(`  ID: ${note.id}`);
      if (note.tags.length) lines.push(`  标签: ${note.tags.join(", ")}`);
      lines.push(`  创建时间: ${note.created_at}`);
      lines.push("");
    }

    return lines.join("\n");
  }
```

## 4. 关键机制与实现细节
- **Markdown + YAML 前置元数据**：便于人类可读，同时可程序化解析。
- **索引加速**：列表和搜索优先走索引，减少全盘扫描。
- **自动备份**：`autoBackup=true` 时写入 `.bak` 索引。

## 5. 例子（从输入到输出）
### 场景
- 记录一条任务状态与一条结论，并搜索关键词。

### 关键步骤
1. `create` 创建笔记并写入索引。
2. `search` 在索引基础上定位并读取内容。
3. `summary` 输出统计信息。

## 6. 可靠性与降级策略
- **索引缺失**：自动创建空索引文件。
- **笔记不存在**：返回清晰的错误提示。
- **备份失败**：不影响主流程，仅影响恢复能力。

## 7. 局限与演进建议
- 搜索为线性扫描，规模较大时可引入倒排索引或向量检索。
- 当前不支持并发写入锁，若多进程并发写入可能发生覆盖。
- 可扩展：按标签聚合、归档策略与版本管理。
