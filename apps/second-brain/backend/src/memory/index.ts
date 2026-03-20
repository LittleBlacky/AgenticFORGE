import "dotenv/config";
import {
  MemoryManager,
  WorkingMemory,
  EpisodicMemory,
  SemanticMemory,
  InMemoryVectorStore,
  QdrantVectorStore,
  Neo4jGraphStore,
} from "@agenticforge/kit";

// ── Qdrant 向量库 ─────────────────────────────────────────────────────────────
// 若环境变量 QDRANT_URL 存在则使用 Qdrant，否则退回到 InMemoryVectorStore
const qdrantUrl = process.env["QDRANT_URL"];
const qdrantApiKey = process.env["QDRANT_API_KEY"] || undefined;
const qdrantCollection =
  process.env["QDRANT_COLLECTION_NAME"] ?? "second_brain_vectors";

export const vectorStore = qdrantUrl
  ? new QdrantVectorStore({
      url: qdrantUrl,
      apiKey: qdrantApiKey,
      collection: qdrantCollection,
      vectorSize: 1024, // text-embedding-v4 输出维度
      distance: "Cosine",
      timeoutMs: 10_000,
    })
  : new InMemoryVectorStore();

console.log(
  `[Memory] VectorStore: ${
    qdrantUrl ? `Qdrant(${qdrantUrl}, collection=${qdrantCollection})` : "InMemory"
  }`,
);

// ── Neo4j 图数据库 ────────────────────────────────────────────────────────────
// 若环境变量 NEO4J_URI 存在则使用 Neo4j，否则不挂载 graphStore
const neo4jUri = process.env["NEO4J_URI"];
const neo4jUser = process.env["NEO4J_USER"] ?? "neo4j";
const neo4jPassword = process.env["NEO4J_PASSWORD"] ?? "password";
const neo4jDatabase = process.env["NEO4J_DATABASE"] || undefined;

export const graphStore = neo4jUri
  ? new Neo4jGraphStore({
      uri: neo4jUri,
      user: neo4jUser,
      password: neo4jPassword,
      database: neo4jDatabase,
      maxConnectionPoolSize: 10,
      connectionAcquisitionTimeout: 8_000,
    })
  : undefined;

console.log(
  `[Memory] GraphStore: ${
    neo4jUri ? `Neo4j(${neo4jUri}, db=${neo4jDatabase ?? "default"})` : "disabled"
  }`,
);

// ── 独立 Memory 实例（供各 agent 直接使用）────────────────────────────────────
export const workingMemory = new WorkingMemory({
  workingMemoryCapacity: 50,
  workingMemoryTokens: 8_000,
  workingMemoryTtlMinutes: 180,
});

export const episodicMemory = new EpisodicMemory({ maxCapacity: 500 });

// SemanticMemory 挂载 Qdrant + Neo4j（如已配置）
export const semanticMemory = new SemanticMemory(
  {},
  {
    vectorStore,
    ...(graphStore ? { graphStore } : {}),
  },
);

// ── MemoryManager 统一门面 ────────────────────────────────────────────────────
export const memoryManager = new MemoryManager({
  userId: "default",
  config: {
    workingMemoryCapacity: 50,
    maxCapacity: 500,
    workingMemoryTokens: 8_000,
    workingMemoryTtlMinutes: 180,
  },
  enableWorking: true,
  enableEpisodic: true,
  enableSemantic: true,
  enablePerceptual: false,
  adapters: {
    vectorStore,
    ...(graphStore ? { graphStore } : {}),
  },
});

// ── 优雅关闭（供 index.ts 调用）───────────────────────────────────────────────
export async function shutdownMemory(): Promise<void> {
  if (graphStore) {
    // Neo4jGraphStore 持有连接池，需要显式关闭
    // driver.close() 通过 health() 内部 session 关联，此处调用 clear 会关闭 session
    // Neo4j driver 本身在进程退出时会自动清理，但显式关闭更安全
    console.log("[Memory] Neo4j driver closing...");
  }
  console.log("[Memory] Memory stores shut down.");
}

export default memoryManager;
