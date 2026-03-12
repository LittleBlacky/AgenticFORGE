import {MemoryManager} from "../src/memory/manager";
import {AdapterFactory} from "../src/memory/storage";
import {QdrantVectorStore} from "../src/memory/storage/qdrant";
import {Neo4jGraphStore} from "../src/memory/storage/neo4j";
import type {AdapterConfig} from "../src/memory/storage";

/**
 * Qdrant + Neo4j 适配器示例
 * 运行前请确保本地已启动 Qdrant(6333) 与 Neo4j(7687)
 */
async function runQdrantNeo4jDemo() {
  console.log("=== Qdrant + Neo4j 适配器示例 ===\n");

  AdapterFactory.registerVectorStore(
    "qdrant",
    (options) => new QdrantVectorStore(options),
  );
  AdapterFactory.registerGraphStore(
    "neo4j",
    (options) => new Neo4jGraphStore(options),
  );

  const adapterConfigs: AdapterConfig[] = [
    {
      type: "vectorStore",
      backend: "qdrant",
      options: {
        url: "http://localhost:6333",
        collection: "agentic_kit_vectors",
        timeoutMs: 5000,
      },
    },
    {
      type: "graphStore",
      backend: "neo4j",
      options: {
        uri: "neo4j://localhost:7687",
        user: "neo4j",
        password: process.env.NEO4J_PASSWORD ?? "",
        database: "neo4j",
      },
    },
  ];

  const manager = new MemoryManager({
    userId: "adapter_demo",
    enableSemantic: true,
    enableEpisodic: true,
    adapterConfigs,
  });

  await manager.initialize();
  console.log("✓ MemoryManager 已初始化\n");

  const registry = manager.getAdapterRegistry();
  const health = await retryHealth(registry, 5, 1500);
  console.log("适配器健康状态:", health);
  console.log("整体健康:", registry.isHealthy() ? "✓ 健康" : "✗ 异常");

  if (!registry.isHealthy()) {
    console.warn("适配器未就绪，请确认 Qdrant 与 Neo4j 是否正常启动。\n");
  }

  console.log("\n添加语义记忆...");
  const semanticId = await manager.addMemory({
    content: "Qdrant 存储向量，Neo4j 存储实体关系",
    memoryType: "semantic",
    importance: 0.9,
    autoClassify: false,
    metadata: {
      tags: ["qdrant", "neo4j", "vector", "graph"],
      source: "qdrant-neo4j-demo",
      scene: "vector-graph-hybrid",
    },
  });
  console.log(`✓ 语义记忆已添加: ${semanticId}`);

  console.log("\n添加情节记忆...");
  const episodicId = await manager.addMemory({
    content: "在知识库系统中，我们用 Qdrant 做语义检索，用 Neo4j 追踪实体关系。",
    memoryType: "episodic",
    importance: 0.75,
    autoClassify: false,
    metadata: {
      tags: ["knowledge-base", "pipeline"],
      source: "qdrant-neo4j-demo",
    },
  });
  console.log(`✓ 情节记忆已添加: ${episodicId}`);

  console.log("\n更新语义记忆的重要度...");
  const updated = await manager.updateMemory({
    memoryId: semanticId,
    importance: 0.95,
    metadata: {tags: ["qdrant", "neo4j", "vector", "graph", "updated"]},
  });
  console.log(updated ? "✓ 语义记忆已更新" : "✗ 未找到可更新记忆");

  console.log("\n检索语义记忆...");
  const semanticResults = await manager.retrieveMemories({
    query: "向量 存储",
    limit: 3,
    memoryTypes: ["semantic"],
  });
  logResults(semanticResults);

  console.log("\n检索包含标签的记忆...");
  const tagResults = await manager.retrieveMemories({
    query: "知识库",
    limit: 5,
    memoryTypes: ["semantic", "episodic"],
  });
  logResults(tagResults);

  console.log("\n按时间过滤情节记忆...");
  const now = new Date();
  const lastHour = new Date(now.getTime() - 60 * 60 * 1000);
  const episodicResults = await manager.retrieveMemories({
    query: "知识库",
    limit: 3,
    memoryTypes: ["episodic"],
    timeRange: [lastHour, now],
  });
  logResults(episodicResults);

  console.log("\n删除情节记忆...");
  const removed = await manager.removeMemory(episodicId);
  console.log(removed ? "✓ 情节记忆已删除" : "✗ 未找到可删除记忆");

  await manager.shutdown();
  console.log("\n✓ 示例完成");
}

function logResults(results: Awaited<ReturnType<MemoryManager["retrieveMemories"]>>) {
  if (results.length === 0) {
    console.log("  (未检索到结果)");
    return;
  }
  results.forEach((item, idx) => {
    console.log(
      `  ${idx + 1}. ${item.content} (type: ${item.memoryType}, score: ${item.metadata.combined_score ?? "-"})`,
    );
  });
}

async function retryHealth(
  registry: ReturnType<MemoryManager["getAdapterRegistry"]>,
  attempts = 3,
  waitMs = 1000,
) {
  let last = await registry.checkHealth();
  if (registry.isHealthy()) return last;

  for (let i = 1; i < attempts; i += 1) {
    await sleep(waitMs);
    last = await registry.checkHealth();
    if (registry.isHealthy()) break;
  }
  return last;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

runQdrantNeo4jDemo().catch((error) => {
  console.error("示例执行出错:", error);
  process.exit(1);
});
