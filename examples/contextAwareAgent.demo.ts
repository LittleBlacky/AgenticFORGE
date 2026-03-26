import "dotenv/config";
import {LLMClient} from "../src/core/llm";
import {Message} from "../src/core/message";
import {ContextBuilder} from "../src/context";
import {MemoryTool} from "../src/tools/builtin/memory";
import {RagTool} from "../src/tools/builtin/rag";

class ContextAwareAgent {
  private readonly llm: LLMClient;
  private readonly systemPrompt: string;
  private readonly memoryTool: MemoryTool;
  private readonly ragTool: RagTool;
  private readonly contextBuilder: ContextBuilder;
  private readonly conversationHistory: Message[] = [];

  constructor(params: {
    llm: LLMClient;
    systemPrompt?: string;
    userId?: string;
    knowledgeBasePath?: string;
  }) {
    this.llm = params.llm;
    this.systemPrompt = params.systemPrompt ?? "";

    this.memoryTool = new MemoryTool({userId: params.userId ?? "default"});
    this.ragTool = new RagTool({
      knowledgeBasePath: params.knowledgeBasePath ?? "./kb",
    });

    this.contextBuilder = new ContextBuilder({
      memoryTool: this.memoryTool,
      ragTool: this.ragTool,
      config: {
        maxTokens: 4000,
      },
    });
  }

  async seedContext(): Promise<void> {
    await this.memoryTool.run({
      action: "add",
      content: "用户偏好：回答必须包含可执行步骤与注意事项。",
      memory_type: "working",
      importance: 0.7,
    });
    await this.memoryTool.run({
      action: "add",
      content: "历史任务：曾经优化过 Pandas 内存，重点是 dtype 压缩与分块读取。",
      memory_type: "episodic",
      importance: 0.8,
    });

    await this.ragTool.addText(
      "Pandas 内存优化常见策略：将 object 列转为 category；数值列用 downcast；读入时指定 dtype 和 usecols；大型数据集使用 chunk 读取或切换到 Polars。",
      "default",
      "pandas-memory-optimization",
    );

    await this.ragTool.addText(
      "Polars 是 Rust 实现的极速 DataFrame 库，内存占用低，性能优于 Pandas。Pandas 转为 Polars 的步骤：1. 安装 Polars；2. 创建 Polars DataFrame；3. 转换数据类型；4. 性能优化技巧。",
      "default",
      "polars-vs-pandas",
    );

    await this.ragTool.addText(
      "Vue 3 响应式原理：Proxy 代理数据，effect 收集依赖，trigger 触发更新。",
      "default",
      "vue-3-reactivity",
    );
  }

  async run(userInput: string): Promise<string> {
    const optimizedContext = await this.contextBuilder.build({
      userQuery: userInput,
      conversationHistory: this.conversationHistory,
      systemInstructions: this.systemPrompt,
    });

    console.log("=== ContextBuilder 组装上下文 ===");
    console.log(optimizedContext);

    const messages = [
      {role: "system" as const, content: optimizedContext},
      {role: "user" as const, content: userInput},
    ];

    const response = await this.llm.think(messages);

    this.conversationHistory.push(
      new Message({content: userInput, role: "user"}),
      new Message({content: response, role: "assistant"}),
    );

    await this.memoryTool.run({
      action: "add",
      content: `Q: ${userInput}\nA: ${response.slice(0, 200)}...`,
      memory_type: "episodic",
      importance: 0.6,
    });

    return response;
  }
}

async function runDemo() {
  const agent = new ContextAwareAgent({
    llm: new LLMClient(),
    systemPrompt: "你是一位资深的 Python 数据工程顾问。",
    userId: "user123",
    knowledgeBasePath: "./data_science_kb",
  });

  await agent.seedContext();

  const response = await agent.run("如何优化 Pandas 的内存占用?");
  console.log(`=== ${agent.constructor.name} 输出 ===`);
  console.log(response);
}

runDemo().catch((error) => {
  console.error("ContextAwareAgent demo 失败:", error);
  process.exitCode = 1;
});
