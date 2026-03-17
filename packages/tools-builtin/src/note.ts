import fs from "node:fs";
import path from "node:path";
import lockfile from "proper-lockfile";
import {Tool, type ToolParameter, toolAction} from "@agenticforge/tools";

export interface NoteToolOptions {
  workspace?: string;
  autoBackup?: boolean;
  maxNotes?: number;
  expandable?: boolean;
  lockTimeoutMs?: number;
  lockRetryIntervalMs?: number;
  enableAtomicNoteWrites?: boolean;
}

type NoteType =
  | "task_state"
  | "conclusion"
  | "blocker"
  | "action"
  | "reference"
  | "general";

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

type NoteRecord = {
  id: string;
  title: string;
  content: string;
  type: NoteType;
  tags: string[];
  created_at: string;
  updated_at: string;
  metadata: {
    word_count: number;
    status: "active" | "archived";
  };
};

type NoteAction =
  | "create"
  | "read"
  | "update"
  | "delete"
  | "list"
  | "search"
  | "summary";

export class NoteTool extends Tool {
  private readonly workspace: string;
  private readonly autoBackup: boolean;
  private readonly maxNotes: number;
  private readonly indexFile: string;
  private readonly lockTimeoutMs: number;
  private readonly lockRetryIntervalMs: number;
  private readonly enableAtomicNoteWrites: boolean;
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
    this.lockTimeoutMs = options.lockTimeoutMs ?? 3000;
    this.lockRetryIntervalMs = options.lockRetryIntervalMs ?? 120;
    this.enableAtomicNoteWrites = options.enableAtomicNoteWrites ?? false;

    fs.mkdirSync(this.workspace, {recursive: true});
    this.notesIndex = this.loadIndex();
  }

  async run(parameters: Record<string, unknown>): Promise<string> {
    if (!this.validateAndNormalizeParameters(parameters).success) {
      return "❌ 参数验证失败";
    }

    const action = String(parameters.action ?? "") as NoteAction;
    const needsLock = action !== "read" && action !== "list" && action !== "search";

    if (!needsLock) {
      return this.executeAction(action, parameters);
    }

    return this.withLock(() => this.executeAction(action, parameters));
  }

  private async executeAction(
    action: NoteAction,
    parameters: Record<string, unknown>,
  ): Promise<string> {
    switch (action) {
      case "create":
        return this.createNote(
          this.toOptionalString(parameters.title),
          this.toOptionalString(parameters.content),
          this.toNoteType(parameters.note_type) ?? "general",
          this.toOptionalStringArray(parameters.tags),
        );
      case "read":
        return this.readNote(this.toOptionalString(parameters.note_id));
      case "update":
        return this.updateNote(
          this.toOptionalString(parameters.note_id),
          this.toOptionalString(parameters.title),
          this.toOptionalString(parameters.content),
          this.toNoteType(parameters.note_type) ?? undefined,
          this.toOptionalStringArray(parameters.tags),
        );
      case "delete":
        return this.deleteNote(this.toOptionalString(parameters.note_id));
      case "list":
        return this.listNotes(
          this.toNoteType(parameters.note_type) ?? undefined,
          this.toNumber(parameters.limit, 10),
        );
      case "search":
        return this.searchNotes(
          this.toOptionalString(parameters.query),
          this.toNumber(parameters.limit, 10),
        );
      case "summary":
        return this.getSummary();
      default:
        return `❌ 不支持的操作: ${action}`;
    }
  }

  getParameters(): ToolParameter[] {
    return [
      {
        name: "action",
        type: "string",
        description:
          "操作类型: create/read/update/delete/list/search/summary",
        required: true,
        default: null,
      },
      {
        name: "title",
        type: "string",
        description: "笔记标题（create/update时必需）",
        required: false,
        default: "",
      },
      {
        name: "content",
        type: "string",
        description: "笔记内容（create/update时必需）",
        required: false,
        default: "",
      },
      {
        name: "note_type",
        type: "string",
        description:
          "笔记类型: task_state/conclusion/blocker/action/reference/general",
        required: false,
        default: "general",
      },
      {
        name: "tags",
        type: "array",
        description: "标签列表（可选）",
        required: false,
        default: [],
      },
      {
        name: "note_id",
        type: "string",
        description: "笔记ID（read/update/delete时必需）",
        required: false,
        default: "",
      },
      {
        name: "query",
        type: "string",
        description: "搜索关键词（search时必需）",
        required: false,
        default: "",
      },
      {
        name: "limit",
        type: "number",
        description: "返回结果数量限制（默认10）",
        required: false,
        default: 10,
      },
    ];
  }

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
    this.writeNoteFile(notePath, this.noteToMarkdown(note));

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

    this.writeNoteFile(notePath, this.noteToMarkdown(note));

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

  @toolAction("note_delete", "删除指定ID的笔记")
  async deleteNote(noteId?: string): Promise<string> {
    if (!noteId) return "❌ 删除笔记需要提供 note_id";
    const notePath = this.getNotePath(noteId);
    if (!fs.existsSync(notePath)) return `❌ 笔记不存在: ${noteId}`;

    fs.unlinkSync(notePath);
    this.notesIndex.notes = this.notesIndex.notes.filter((note) => note.id !== noteId);
    this.notesIndex.metadata.total_notes = this.notesIndex.notes.length;
    this.saveIndex();

    return `✅ 笔记已删除: ${noteId}`;
  }

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

  @toolAction("note_search", "搜索包含关键词的笔记")
  async searchNotes(query?: string, limit = 10): Promise<string> {
    if (!query) return "❌ 搜索需要提供 query";
    const lowered = query.toLowerCase();
    const results: NoteRecord[] = [];

    for (const record of this.notesIndex.notes) {
      const notePath = this.getNotePath(record.id);
      if (!fs.existsSync(notePath)) continue;
      const markdownText = fs.readFileSync(notePath, "utf-8");
      const note = this.markdownToNote(markdownText);
      const matched =
        note.title.toLowerCase().includes(lowered) ||
        note.content.toLowerCase().includes(lowered) ||
        note.tags.some((tag) => tag.toLowerCase().includes(lowered));

      if (matched) results.push(note);
      if (results.length >= limit) break;
    }

    if (!results.length) return `📝 未找到匹配 '${query}' 的笔记`;

    const lines = [`🔍 搜索结果（共 ${results.length} 条）`, ""];
    for (const note of results) {
      lines.push(this.formatNote(note, true));
      lines.push("");
    }

    return lines.join("\n");
  }

  @toolAction("note_summary", "获取笔记系统的摘要统计信息")
  async getSummary(): Promise<string> {
    const total = this.notesIndex.notes.length;
    const typeCounts: Record<string, number> = {};

    for (const note of this.notesIndex.notes) {
      typeCounts[note.type] = (typeCounts[note.type] ?? 0) + 1;
    }

    const lines = ["📊 笔记摘要", "", `总笔记数: ${total}`, "", "按类型统计:"];
    for (const [type, count] of Object.entries(typeCounts)) {
      lines.push(`  • ${type}: ${count}`);
    }

    return lines.join("\n");
  }

  private loadIndex(): NoteIndex {
    if (fs.existsSync(this.indexFile)) {
      const raw = fs.readFileSync(this.indexFile, "utf-8");
      return JSON.parse(raw) as NoteIndex;
    }

    const initial: NoteIndex = {
      notes: [],
      metadata: {
        created_at: new Date().toISOString(),
        total_notes: 0,
      },
    };
    fs.writeFileSync(this.indexFile, JSON.stringify(initial, null, 2), "utf-8");
    return initial;
  }

  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    try {
      const release = await lockfile.lock(this.workspace, {
        stale: this.lockTimeoutMs,
        retries: {
          retries: Math.max(0, Math.floor(this.lockTimeoutMs / this.lockRetryIntervalMs)),
          minTimeout: this.lockRetryIntervalMs,
          maxTimeout: this.lockRetryIntervalMs,
        },
      });

      try {
        return await fn();
      } finally {
        await release();
      }
    } catch (error) {
      throw new Error(`获取笔记锁失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private saveIndex(): void {
    const backupPath = `${this.indexFile}.bak`;
    const payload = JSON.stringify(this.notesIndex, null, 2);
    const tmpPath = `${this.indexFile}.tmp`;

    fs.writeFileSync(tmpPath, payload, "utf-8");
    fs.renameSync(tmpPath, this.indexFile);

    if (this.autoBackup) {
      fs.writeFileSync(backupPath, payload, "utf-8");
    }
  }

  private generateNoteId(): string {
    const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
    const count = this.notesIndex.notes.length;
    return `note_${timestamp}_${count}`;
  }

  private getNotePath(noteId: string): string {
    return path.join(this.workspace, `${noteId}.md`);
  }

  private writeNoteFile(notePath: string, content: string): void {
    if (!this.enableAtomicNoteWrites) {
      fs.writeFileSync(notePath, content, "utf-8");
      return;
    }

    const tmpPath = `${notePath}.tmp`;
    fs.writeFileSync(tmpPath, content, "utf-8");
    fs.renameSync(tmpPath, notePath);
  }

  private noteToMarkdown(note: NoteRecord): string {
    const frontmatterLines = [
      "---",
      `id: ${note.id}`,
      `title: ${note.title}`,
      `type: ${note.type}`,
    ];

    if (note.tags.length) {
      frontmatterLines.push(`tags: ${JSON.stringify(note.tags)}`);
    }

    frontmatterLines.push(`created_at: ${note.created_at}`);
    frontmatterLines.push(`updated_at: ${note.updated_at}`);
    frontmatterLines.push("---", "");

    const body = `# ${note.title}\n\n${note.content}`;
    return frontmatterLines.join("\n") + "\n" + body;
  }

  private markdownToNote(markdownText: string): NoteRecord {
    const match = markdownText.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
    if (!match) {
      throw new Error("无效的笔记格式：缺少 YAML 前置元数据");
    }

    const frontmatterText = match[1] ?? "";
    const contentStart = match[0].length;
    const note: Partial<NoteRecord> = {
      metadata: {
        word_count: 0,
        status: "active",
      },
    };

    for (const line of frontmatterText.split("\n")) {
      const idx = line.indexOf(":");
      if (idx < 0) continue;
      const key = line.slice(0, idx).trim();
      const raw = line.slice(idx + 1).trim();
      if (key === "tags") {
        try {
          note.tags = JSON.parse(raw) as string[];
        } catch {
          note.tags = [];
        }
      } else {
        (note as Record<string, unknown>)[key] = raw;
      }
    }

    let markdownContent = markdownText.slice(contentStart).trim();
    if (markdownContent.startsWith("# ")) {
      markdownContent = markdownContent.split("\n").slice(1).join("\n").trim();
    }

    note.content = markdownContent;
    note.metadata = {
      word_count: markdownContent.length,
      status: "active",
    };

    return note as NoteRecord;
  }

  private formatNote(note: NoteRecord, compact: boolean): string {
    if (compact) {
      const preview = note.content.length > 100
        ? `${note.content.slice(0, 100)}...`
        : note.content;
      return `[${note.type}] ${note.title}\nID: ${note.id}\n内容: ${preview}`;
    }

    const lines = [
      "📝 笔记详情",
      "",
      `ID: ${note.id}`,
      `标题: ${note.title}`,
      `类型: ${note.type}`,
    ];

    if (note.tags.length) {
      lines.push(`标签: ${note.tags.join(", ")}`);
    }

    lines.push(`创建时间: ${note.created_at}`);
    lines.push(`更新时间: ${note.updated_at}`);
    lines.push("", "内容:", note.content);
    return lines.join("\n");
  }

  private toOptionalString(value: unknown): string | undefined {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
  }

  private toOptionalStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.map((item) => String(item)).filter((item) => item.length > 0);
  }

  private toNumber(value: unknown, fallback: number): number {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return fallback;
  }

  private toNoteType(value: unknown): NoteType | null {
    const candidate = typeof value === "string" ? value : "";
    if (
      candidate === "task_state" ||
      candidate === "conclusion" ||
      candidate === "blocker" ||
      candidate === "action" ||
      candidate === "reference" ||
      candidate === "general"
    ) {
      return candidate;
    }
    return null;
  }
}
