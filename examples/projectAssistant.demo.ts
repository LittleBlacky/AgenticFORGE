import "dotenv/config";
import {LLMClient} from "../src/core/llm";
import {Message} from "../src/core/message";
import {
  ContextBuilder,
  ContextPacketBuilder,
  createTokenCounter,
} from "../src/context";
import {MemoryTool} from "../src/tools/builtin/memory";
import {RagTool} from "../src/tools/builtin/rag";
import {NoteTool} from "../src/tools/builtin/note";

class ProjectAssistant {
  private readonly llm: LLMClient;
  private readonly projectName: string;
  private readonly memoryTool: MemoryTool;
  private readonly ragTool: RagTool;
  private readonly noteTool: NoteTool;
  private readonly contextBuilder: ContextBuilder;
  private conversationHistory: Message[] = [];

  constructor(params: {projectName: string; systemPrompt?: string}) {
    this.llm = new LLMClient();
    this.projectName = params.projectName;

    this.memoryTool = new MemoryTool({userId: this.projectName});
    this.ragTool = new RagTool({
      knowledgeBasePath: `./${this.projectName}_kb`,
    });
    this.noteTool = new NoteTool({workspace: `./${this.projectName}_notes`});

    this.contextBuilder = new ContextBuilder({
      memoryTool: this.memoryTool,
      ragTool: this.ragTool,
      config: {
        maxTokens: 4000,
        tokenCounter: createTokenCounter({encodingName: "cl100k_base"}),
      },
    });
  }

  async run(userInput: string, noteAsAction = false): Promise<string> {
    const relevantNotes = await this.retrieveRelevantNotes(userInput);
    const notePackets = relevantNotes.map((note) =>
      ContextPacketBuilder.create(
        `[笔记:${note.title}]\n${note.content}`,
        {
          type: "note",
          note_type: note.type,
          note_id: note.id,
        },
      ),
    );

    const context = await this.contextBuilder.build({
      userQuery: userInput,
      conversationHistory: this.conversationHistory,
      systemInstructions: this.buildSystemInstructions(),
      additionalPackets: notePackets,
    });

    const response = await this.llm.think([
      {role: "system", content: context},
      {role: "user", content: userInput},
    ]);

    if (noteAsAction) {
      await this.saveAsNote(userInput, response);
    }

    this.updateHistory(userInput, response);

    return response;
  }

  private async retrieveRelevantNotes(query: string, limit = 3): Promise<
    Array<{
      id: string;
      title: string;
      content: string;
      type: string;
      updatedAt: string;
    }>
  > {
    const blockersRaw = await this.noteTool.run({
      action: "list",
      note_type: "blocker",
      limit: 2,
    });

    const searchRaw = await this.noteTool.run({
      action: "search",
      query,
      limit,
    });

    const parsed = [...this.parseNotes(blockersRaw), ...this.parseNotes(searchRaw)];
    const unique = new Map<string, typeof parsed[number]>();
    for (const note of parsed) {
      unique.set(note.id, note);
    }

    return Array.from(unique.values()).slice(0, limit);
  }

  private parseNotes(raw: string): Array<{
    id: string;
    title: string;
    content: string;
    type: string;
    updatedAt: string;
  }> {
    const records: Array<{
      id: string;
      title: string;
      content: string;
      type: string;
      updatedAt: string;
    }> = [];

    const blocks = raw.split(/\n\n+/).map((b) => b.trim()).filter(Boolean);
    for (const block of blocks) {
      if (!block.startsWith("[")) continue;
      const idMatch = block.match(/ID:\s*(\S+)/);
      const titleMatch = block.match(/^\[[^\]]+\]\s*(.+)/);
      const contentMatch = block.match(/内容:\s*([\s\S]*)/);
      const typeMatch = block.match(/^\[([^\]]+)]/);

      if (!idMatch || !titleMatch) continue;
      records.push({
        id: idMatch[1]!,
        title: titleMatch[1]!,
        content: contentMatch?.[1]?.trim() ?? "",
        type: typeMatch?.[1] ?? "general",
        updatedAt: new Date().toISOString(),
      });
    }

    return records;
  }

  private async saveAsNote(userInput: string, response: string): Promise<void> {
    const noteType = userInput.includes("阻塞")
      ? "blocker"
      : userInput.includes("计划") || userInput.includes("下一步")
        ? "action"
        : "conclusion";

    await this.noteTool.run({
      action: "create",
      title: `${userInput.slice(0, 30)}...`,
      content: `## 问题\n${userInput}\n\n## 分析\n${response}`,
      note_type: noteType,
      tags: [this.projectName, "auto_generated"],
    });
  }

  private buildSystemInstructions(): string {
    return `你是 ${this.projectName} 项目的长期助手。\n\n` +
      "你的职责:\n" +
      "1. 基于历史笔记提供连贯的建议\n" +
      "2. 追踪项目进展和待解决问题\n" +
      "3. 在回答时引用相关的历史笔记\n" +
      "4. 提供具体、可操作的下一步建议\n\n" +
      "注意:\n" +
      "- 优先关注标记为 blocker 的问题\n" +
      "- 在建议中说明依据来源(笔记、记忆或知识库)\n" +
      "- 保持对项目整体进度的认识";
  }

  private updateHistory(userInput: string, response: string): void {
    this.conversationHistory.push(
      new Message({content: userInput, role: "user"}),
      new Message({content: response, role: "assistant"}),
    );

    if (this.conversationHistory.length > 10) {
      this.conversationHistory = this.conversationHistory.slice(-10);
    }
  }
}

async function runDemo() {
  const assistant = new ProjectAssistant({
    projectName: "data_pipeline_refactoring",
    systemPrompt: "你是一位资深的数据工程顾问。",
  });

  await assistant.run(
    "我们已经完成了数据模型层的重构,测试覆盖率达到85%。下一步计划重构业务逻辑层。",
    true,
  );

  const response = await assistant.run(
    "在重构业务逻辑层时,我遇到了依赖版本冲突的问题,该如何解决?",
  );

  console.log("=== ProjectAssistant 输出 ===");
  console.log(response);

  const summary = await assistant.noteTool.run({action: "summary"});
  console.log("=== 笔记摘要 ===");
  console.log(summary);
}

runDemo().catch((error) => {
  console.error("ProjectAssistant demo 失败:", error);
  process.exitCode = 1;
});
