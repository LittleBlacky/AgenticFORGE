# Memory 存储适配层 - 扩展与最佳实践

> 本文档是 UNIFIED_GUIDE_PART1.md 的续篇，包含扩展指南、最佳实践和完整参考。

**项目状态**: ✅ 完成 | **最后更新**: 2026-03-11

---

## 情景记忆存储方案

情景记忆负责存储具体的事件和经历，它的设计重点在于保持事件的完整性和时间序列关系。
情景记忆采用了 SQLite + Qdrant 的混合存储方案：SQLite 负责结构化数据的持久化与复杂查询，Qdrant 负责高效的向量检索。

---

## 扩展指南

### 设计原则

`AdapterFactory` 内置了一套**静态注册表**，用户无需修改 SDK 源码，只需：

1. 实现对应的适配器接口
2. 调用一次 `AdapterFactory.registerXxx()` 注册工厂函数
3. 在 `adapterConfigs` 中直接使用注册的 `backend` 名称

```
用户实现接口  →  register 注册  →  adapterConfigs 使用
     ↓                ↓                    ↓
MyVectorStore  registerVectorStore   backend: "my-vector"
```

---

### 注册方法一览

```typescript
import {AdapterFactory} from "@blacky/agents-sdk/memory/storage";

AdapterFactory.registerKVStore("redis",  (opts) => new RedisKVStore(opts));
AdapterFactory.registerVectorStore("qdrant", (opts) => new QdrantVectorStore(opts));
AdapterFactory.registerGraphStore("neo4j", (opts) => new Neo4jGraphStore(opts));
AdapterFactory.registerBlobStore("s3",    (opts) => new S3BlobStore(opts));

// 查看已注册的后端
console.log(AdapterFactory.listRegistered());
// { kvStore:["redis"], vectorStore:["qdrant"], graphStore:["neo4j"], blobStore:["s3"] }
```

---

### 完整示例：接入自定义 VectorStore

#### 第 1 步：实现接口

```typescript
// my-vector-store.ts
import type {VectorStoreAdapter} from "@blacky/agents-sdk/memory/storage";

export class MyVectorStore implements VectorStoreAdapter {
  constructor(private opts?: Record<string, unknown>) {}

  async upsertVector(p: {id: string; vector: number[]; payload: Record<string, unknown>}): Promise<void> {
    // 调用你的数据库 SDK
  }
  async queryVector(p: {vector: number[]; limit: number; filter?: Record<string, unknown>}): Promise<Array<{id: string; score: number; payload: Record<string, unknown>}>> {
    return [];
  }
  async deleteVector(id: string): Promise<void> {}
  async clear(): Promise<void> {}
  async health(): Promise<boolean> { return true; }
}
```

#### 第 2 步：在入口注册（一次注册，全局生效）

```typescript
import {AdapterFactory} from "@blacky/agents-sdk/memory/storage";
import {MyVectorStore} from "./my-vector-store";

AdapterFactory.registerVectorStore("my-vector", (opts) => new MyVectorStore(opts));
```

#### 第 3 步：在 MemoryManager 中使用

```typescript
const manager = new MemoryManager({
  userId: "user_123",
  adapterConfigs: [
    {type: "kvStore",     backend: "memory"},
    {type: "vectorStore", backend: "my-vector", options: {url: "http://..."}},
  ],
});
await manager.initialize();
await manager.shutdown();
```

---

### 直接注入实例（无需注册）

```typescript
const manager = new MemoryManager({
  storageAdapters: {
    vectorStore: new MyVectorStore({url: "http://..."}),
  },
});
```

| 方式 | 适用场景 |
|------|----------|
| `register` + `adapterConfigs` | 多处复用；配置驱动；生产推荐 |
| 直接传 `storageAdapters` | 单次使用；测试；快速原型 |

---

### 实现自定义 KVStore 适配器（完整参考）

```typescript
import type {KVStoreAdapter} from "@blacky/agents-sdk/memory/storage";

class CustomKVStore<T> implements KVStoreAdapter<T> {
  private store = new Map<string, T>();

  async put(id: string, item: T): Promise<void> {
    this.store.set(id, item);
  }

  async get(id: string): Promise<T | null> {
    return this.store.get(id) ?? null;
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }

  async list(): Promise<T[]> {
    return Array.from(this.store.values());
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  async health(): Promise<boolean> {
    return true;
  }
}

// 注入到 MemoryManager
const manager = new MemoryManager({
  storageAdapters: {
    kvStore: new CustomKVStore(),
  },
});
```

### 在工厂中注册新后端

```typescript
// 修改 src/memory/storage/factory.ts
import {CustomKVStore} from "./custom";

export class AdapterFactory {
  static createKVStore(config: AdapterConfig): KVStoreAdapter<any> {
    switch (config.backend) {
      case "memory":
        return new InMemoryKVStore();
      case "custom":
        return new CustomKVStore();
      default:
        throw new Error(`不支持的 KVStore 后端: ${config.backend}`);
    }
  }
}

// 使用
const manager = new MemoryManager({
  adapterConfigs: [
    {type: "kvStore", backend: "custom"},
  ],
});
```

---

## 集成 Qdrant 向量库

### 安装依赖

```bash
npm install @qdrant/js-client
```

### 适配器实现

```typescript
import {QdrantClient} from "@qdrant/js-client";
import type {VectorStoreAdapter} from "./types";

export class QdrantVectorStore implements VectorStoreAdapter {
  private client: QdrantClient;
  private collectionName: string;
  private readonly vectorSize = 384;

  constructor(config: {url: string; apiKey?: string; collectionName?: string}) {
    this.collectionName = config.collectionName ?? "memory_vectors";
    this.client = new QdrantClient({url: config.url, apiKey: config.apiKey});
  }

  async initialize(): Promise<void> {
    const collections = await this.client.getCollections();
    const exists = collections.collections.some(
      (c) => c.name === this.collectionName,
    );
    if (!exists) {
      await this.client.createCollection(this.collectionName, {
        vectors: {size: this.vectorSize, distance: "Cosine"},
      });
    }
  }

  async upsertVector(params: {
    id: string;
    vector: number[];
    payload: Record<string, unknown>;
  }): Promise<void> {
    await this.client.upsert(this.collectionName, {
      points: [{id: this.hashId(params.id), vector: params.vector, payload: params.payload}],
    });
  }

  async queryVector(params: {
    vector: number[];
    limit: number;
    filter?: Record<string, unknown>;
  }): Promise<Array<{id: string; score: number; payload: Record<string, unknown>}>> {
    const results = await this.client.search(this.collectionName, {
      vector: params.vector,
      limit: params.limit,
      query_filter: params.filter,
      with_payload: true,
    });
    return results.map((r) => ({
      id: String(r.id),
      score: r.score,
      payload: r.payload as Record<string, unknown>,
    }));
  }

  async deleteVector(id: string): Promise<void> {
    await this.client.delete(this.collectionName, {
      points_selector: {ids: [this.hashId(id)]},
    });
  }

  async clear(): Promise<void> {
    await this.client.deleteCollection(this.collectionName);
    await this.initialize();
  }

  async health(): Promise<boolean> {
    try {
      const h = await this.client.healthz();
      return h.status === "ok";
    } catch {
      return false;
    }
  }

  private hashId(id: string): number {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = (hash << 5) - hash + id.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }
}
```

### 注册并使用

```typescript
import {AdapterFactory} from "@blacky/agents-sdk/memory/storage";
import {QdrantVectorStore} from "./qdrant-vector-store";

// 入口处注册一次
AdapterFactory.registerVectorStore("qdrant", (opts) => new QdrantVectorStore(opts));

// 任意 MemoryManager 直接使用
const manager = new MemoryManager({
  userId: "user_123",
  adapterConfigs: [
    {type: "kvStore",     backend: "memory"},
    {type: "vectorStore", backend: "qdrant", options: {url: "http://localhost:6333"}},
  ],
});
```

---

## 集成 Neo4j 图数据库

### 安装依赖

```bash
npm install neo4j-driver
```

### 适配器实现

> 注意：Neo4j 不允许节点/关系属性为 Map，因此 `Entity.properties` / `Relation.properties`
> 需限制为原始类型或原始数组，并在写入时扁平化展开（`n += props`）。

#### 属性约束与兼容策略

**问题出处**
- Neo4j 驱动报错：`Property values can only be of primitive types or arrays thereof. Encountered: Map{}`
- 触发原因：`Entity.properties` / `Relation.properties` 作为整体字段写入（`n.properties = $props`），会被驱动当作 Map 传入 Neo4j。

> `properties` 是给实体/关系附加的扩展属性集合，例如 `session_id`、`outcome`、`source`、`tags`、`score` 等，会随着记忆写入时的上下文被动态携带。

```typescript
// 真实问题代码（旧实现）
await session.run(
  `UNWIND $rows AS row
   MERGE (e:Entity {entityId: row.entityId})
   SET e.name = row.name,
       e.entityType = row.entityType,
       e.description = row.description,
       e.properties = row.properties, // Map 被整体写入
       e.frequency = coalesce(e.frequency, 0) + row.frequency`,
  {rows},
);

// Neo4j 报错：Property values can only be of primitive types or arrays thereof. Encountered: Map{}
```

**修正方式**
- 统一约束：`properties` 仅允许原始类型或原始数组（string/number/boolean/null）
- Neo4j 写入：使用 `n += props` / `rel += props` 将属性扁平化写入
  - `+=` 是 Cypher 的“合并属性”语法，等价于逐个 `SET n.key = props.key`
  - JS 类比：`n += props` 等价于 `Object.assign(node, props)`
  - 这样不会把 `props` 当作单个 Map 属性写入

**结果**
- Neo4j 不再报 Map 类型错误
- 语义/情节记忆写入正常，检索流程可继续
- 其他图数据库可在适配器内部自定义转换策略，不影响上层模型

- 其他图数据库：如支持 Map，可在适配器内部自行转换，不影响上层模型

```typescript
import neo4j from "neo4j-driver";
import type {GraphStoreAdapter, Entity, Relation} from "./types";

export class Neo4jGraphStore implements GraphStoreAdapter {
  private driver: neo4j.Driver;
  private database: string;

  constructor(config: {url: string; username: string; password: string; database?: string}) {
    this.database = config.database ?? "neo4j";
    this.driver = neo4j.driver(
      config.url,
      neo4j.auth.basic(config.username, config.password),
    );
  }

  async initialize(): Promise<void> {
    const session = this.driver.session({database: this.database});
    await session.run("RETURN 1");
    await session.run(
      "CREATE INDEX entity_id IF NOT EXISTS FOR (e:Entity) ON (e.entityId)",
    );
    await session.close();
  }

  async upsertEntities(entities: Entity[]): Promise<void> {
    const session = this.driver.session({database: this.database});
    try {
      for (const e of entities) {
        await session.run(
          `MERGE (n:Entity {entityId: $entityId})
           SET n.name = $name, n.entityType = $entityType,
               n += $props,
               n.frequency = COALESCE(n.frequency, 0) + 1`,
          {
            entityId: e.entityId,
            name: e.name,
            entityType: e.entityType,
            props: e.properties,
          },
        );
      }
    } finally {
      await session.close();
    }
  }

  async upsertRelations(relations: Relation[]): Promise<void> {
    const session = this.driver.session({database: this.database});
    try {
      for (const r of relations) {
        await session.run(
          `MATCH (from:Entity {entityId: $from})
           MATCH (to:Entity {entityId: $to})
           MERGE (from)-[rel:RELATED]->(to)
           SET rel.strength = $strength,
               rel += $props,
               rel.frequency = COALESCE(rel.frequency, 0) + 1`,
          {
            from: r.fromEntity,
            to: r.toEntity,
            strength: r.strength,
            props: r.properties,
          },
        );
      }
    } finally {
      await session.close();
    }
  }

  async queryGraph(params: {
    queryText: string;
    limit: number;
  }): Promise<Array<{entityId: string; score: number}>> {
    const session = this.driver.session({database: this.database});
    try {
      const result = await session.run(
        `MATCH (e:Entity) WHERE e.name CONTAINS $query
         RETURN e.entityId as entityId, (e.frequency * 0.5 + 0.5) as score
         ORDER BY score DESC LIMIT $limit`,
        {query: params.queryText, limit: params.limit},
      );
      return result.records.map((rec) => ({
        entityId: rec.get("entityId"),
        score: rec.get("score"),
      }));
    } finally {
      await session.close();
    }
  }

  async deleteByMemoryId(memoryId: string): Promise<void> {
    const session = this.driver.session({database: this.database});
    try {
      await session.run(
        "MATCH (e:Entity {entityId: $memoryId}) DETACH DELETE e",
        {memoryId},
      );
    } finally {
      await session.close();
    }
  }

  async clear(): Promise<void> {
    const session = this.driver.session({database: this.database});
    try {
      await session.run("MATCH (n) DETACH DELETE n");
    } finally {
      await session.close();
    }
  }

  async health(): Promise<boolean> {
    try {
      const session = this.driver.session({database: this.database});
      await session.run("RETURN 1");
      await session.close();
      return true;
    } catch {
      return false;
    }
  }

  async shutdown(): Promise<void> {
    await this.driver.close();
  }
}
```

### 注册并使用

```typescript
import {AdapterFactory} from "@blacky/agents-sdk/memory/storage";
import {Neo4jGraphStore} from "./neo4j-graph-store";

// 入口处注册一次
AdapterFactory.registerGraphStore("neo4j", (opts) => new Neo4jGraphStore(opts));

// 任意 MemoryManager 直接使用
const manager = new MemoryManager({
  userId: "user_123",
  adapterConfigs: [
    {type: "kvStore",    backend: "memory"},
    {type: "graphStore", backend: "neo4j", options: {url: "bolt://localhost:7687", username: "neo4j", password: "password"}},
  ],
});
```

---

## 最佳实践

### 1. 初始化和清理

```typescript
const manager = new MemoryManager({...});
await manager.initialize();
try {
  // 使用 manager
} finally {
  await manager.shutdown();
}
```

### 2. 降级和容错

```typescript
// 健康检查 + 自动告警
const registry = manager.getAdapterRegistry();
setInterval(async () => {
  const health = await registry.checkHealth();
  if (!health.vectorStore) {
    console.warn("向量存储不可用，已自动降级");
  }
}, 30000);
```

> 注意：如果适配器的 `health()` 内部使用了 `this`（例如 `this.openSession()`），调用时必须保留绑定上下文。
> 因此在注册表里应该使用 `health.call(adapter)`，而不是直接 `health()` 或 `adapter.health?.()`，否则会导致 `this` 变成 `undefined`。

```typescript

// 重试包装器
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delayMs = 1000,
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
    }
  }
  throw new Error("重试失败");
}

await withRetry(() => manager.retrieveMemories({query: "...", limit: 10}));
```

### 3. 性能优化

```typescript
// 限制范围，减少搜索
const results = await manager.retrieveMemories({
  query: "特定关键词",
  memoryTypes: ["semantic"],
  limit: 5,
  minImportance: 0.7,
});

// 定期清理低重要度记忆
setInterval(async () => {
  await manager.forgetMemories({strategy: "importance_based", threshold: 0.3});
}, 24 * 60 * 60 * 1000);
```

### 4. 监控

```typescript
const stats = await manager.getMemoryStats();
console.log("总记忆数:", stats.totalMemories);
console.log("按类型:", stats.memoriesByType);

const health = await manager.getAdapterRegistry().checkHealth();
console.log("系统健康:", manager.getAdapterRegistry().isHealthy());
```

---

## 迁移策略

### 蓝绿部署

```typescript
const blueManager = new MemoryManager({
  adapterConfigs: [{type: "vectorStore", backend: "memory"}],
});
const greenManager = new MemoryManager({
  adapterConfigs: [{type: "vectorStore", backend: "qdrant", options: {...}}],
});

let activeManager = blueManager;
const greenHealth = await greenManager.getAdapterRegistry().checkHealth();
if (greenHealth.vectorStore) {
  activeManager = greenManager;
}
```

### 金丝雀发布

```typescript
function shouldUseNewBackend(userId: string): boolean {
  return userId.charCodeAt(0) % 100 < 5; // 5% 用户
}

const manager = new MemoryManager({
  userId: user.id,
  adapterConfigs: shouldUseNewBackend(user.id)
    ? [{type: "vectorStore", backend: "qdrant", options: {...}}]
    : [{type: "vectorStore", backend: "memory"}],
});
```

---

## Qdrant / Neo4j 参考配置

### Qdrant 向量库（VectorStore）

```typescript
import {AdapterFactory} from "@blacky/agents-sdk/memory/storage";
import {QdrantVectorStore} from "@blacky/agents-sdk/memory/storage/qdrant";

AdapterFactory.registerVectorStore(
  "qdrant",
  (options) => new QdrantVectorStore(options),
);

const manager = new MemoryManager({
  adapterConfigs: [
    {
      type: "vectorStore",
      backend: "qdrant",
      options: {
        url: "http://localhost:6333",
        collection: "blacky_memories",
        apiKey: "qdrant_api_key",
        timeoutMs: 5000,
      },
    },
  ],
});
```

### Neo4j 图数据库（GraphStore）

```typescript
import {AdapterFactory} from "@blacky/agents-sdk/memory/storage";
import {Neo4jGraphStore} from "@blacky/agents-sdk/memory/storage/neo4j";

AdapterFactory.registerGraphStore(
  "neo4j",
  (options) => new Neo4jGraphStore(options),
);

const manager = new MemoryManager({
  adapterConfigs: [
    {
      type: "graphStore",
      backend: "neo4j",
      options: {
        uri: "neo4j://localhost:7687",
        user: "neo4j",
        password: "password",
        database: "neo4j",
        maxConnectionPoolSize: 50,
      },
    },
  ],
});
```

---

## 未来规划

### P2 阶段（数据库接入）
- [ ] Qdrant 向量库集成
- [ ] Neo4j 图数据库集成
- [ ] PostgreSQL 关系数据库
- [ ] S3/MinIO 对象存储

### P3 阶段（工程化）
- [ ] 连接池管理
- [ ] 批量操作 API
- [ ] 缓存层优化
- [ ] 可观测性指标

### P4 阶段（高级特性）
- [ ] 分布式存储支持
- [ ] 数据同步机制
- [ ] 备份和恢复
- [ ] 性能监控

---

## 相关资源

### 源代码
- `src/memory/storage/types.ts` — 适配器接口定义
- `src/memory/storage/inMemory.ts` — 内存实现
- `src/memory/storage/factory.ts` — 工厂模式
- `src/memory/storage/registry.ts` — 注册表管理
- `src/memory/manager.ts` — MemoryManager
- `src/memory/types/perceptual.ts` — 感知记忆
- `examples/memory.adapter.demo.ts` — 完整示例

### 外部数据库
- [Qdrant 官方文档](https://qdrant.tech/documentation/)
- [Neo4j 官方文档](https://neo4j.com/docs/)
- [Milvus](https://milvus.io/) — 开源向量数据库
- [Pinecone](https://www.pinecone.io/) — 云向量数据库

---

**上篇**: [UNIFIED_GUIDE_PART1.md](./UNIFIED_GUIDE_PART1.md)

**项目完成日期**: 2026-03-11 | **版本**: 1.0.0 | **状态**: ✅ 生产就绪
