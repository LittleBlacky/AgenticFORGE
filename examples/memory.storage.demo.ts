import "dotenv/config";
import {
  createQdrantVectorStoreFromEnv,
  createNeo4jGraphStoreFromEnv,
  createLocalBlobStoreFromEnv,
} from "../src/memory/storage";
import {MemoryManager} from "../src/memory/manager";

async function main() {
  const vectorStore = createQdrantVectorStoreFromEnv();
  const graphStore = createNeo4jGraphStoreFromEnv();
  const blobStore = createLocalBlobStoreFromEnv();

  if (!vectorStore || !graphStore) {
    console.log("缺少 Qdrant 或 Neo4j 环境变量，无法执行示例。");
    return;
  }

  const memoryManager = new MemoryManager({
    enableWorking: false,
    enableEpisodic: false,
    enableSemantic: true,
    enablePerceptual: true,
    storageAdapters: {
      vectorStore,
      graphStore,
      blobStore: blobStore ?? undefined,
    },
  });

  const semanticId = await memoryManager.addMemory({
    content: "JWT 是一种无状态认证机制，常用于前后端分离的身份校验。",
    memoryType: "semantic",
    importance: 0.8,
    metadata: {source: "demo"},
    autoClassify: false,
  });

  const perceptualId = await memoryManager.addMemory({
    content: "assets/demo-image.png",
    memoryType: "perceptual",
    importance: 0.6,
    metadata: {
      modality: "image",
      raw_data: "assets/demo-image.png",
      source: "demo",
    },
    autoClassify: false,
  });

  console.log("写入完成:", {semanticId, perceptualId});

  const results = await memoryManager.retrieveMemories({
    query: "JWT 认证",
    limit: 3,
    memoryTypes: ["semantic"],
  });

  console.log("检索结果:");
  for (const item of results) {
    console.log("-", item.content);
  }
}

main().catch((error) => {
  console.error("示例运行失败:", error);
  process.exitCode = 1;
});
