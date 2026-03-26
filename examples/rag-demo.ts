import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { createRagPipeline, OpenAITextEmbedder } from "../src/memory/rag";
import { InMemoryVectorStore } from "../src/memory/storage/inMemory";
import { QdrantVectorStore } from "../src/memory/storage/qdrant";

// 加载 .env
config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run(): Promise<void> {
  const workspaceRoot = path.resolve(__dirname, "..");
  const docPath = path.join(
    workspaceRoot,
    "docs",
    "16-RAG系统完整解析.md",
  );

  // --- 代码配置 embedder（阿里云 text-embedding-v4，维度 1024）---
  const embedder = new OpenAITextEmbedder({
    model: "text-embedding-v4",
    apiKey: process.env.EMBEDDING_API_KEY!,
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  });

  // --- 代码配置 store（内存，无需外部服务）---
  // const store = new InMemoryVectorStore();

  // --- 若 Qdrant 已启动，替换为下面这段（vectorSize 需与 embedding 维度一致）---
  const store = new QdrantVectorStore({
    url: "http://localhost:6333",
    collection: "rag_demo",
    vectorSize: 1024,  // text-embedding-v4 默认维度
    distance: "Cosine",
  });

  const rag = createRagPipeline({
    ragNamespace: "demo",
    ragUserId: "demo_user",
    store,
    embedder,
    dimension: 1024,  // 与 text-embedding-v4 一致

  });

  // 输出 store / embedder 信息
  const storeType = rag.store.constructor.name;
  const storeHealthy = await rag.store.health();
  const embedderType = embedder.constructor.name;
  console.log(`[rag-demo] store:    ${storeType}, healthy=${storeHealthy}`);
  console.log(`[rag-demo] embedder: ${embedderType}`);

  const added = await rag.addDocuments([docPath], 800, 50);
  console.log(`[rag-demo] indexed chunks: ${added}`);

  const hits = await rag.searchAdvanced(
    "RAG是什么",
    5,
    true,
    true,
  );

  console.log("[rag-demo] top hits:");
  for (const hit of hits) {
    const meta = hit.metadata;
    console.log(
      `- score=${hit.score.toFixed(4)} doc=${meta.doc_id ?? "?"} start=${meta.start ?? "?"}`,
    );
  }
}

run().catch((error) => {
  console.error("[rag-demo] failed:", error);
  process.exitCode = 1;
});
