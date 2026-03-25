/**
 * memory/src/storage — InMemoryKVStore, InMemoryVectorStore, InMemoryGraphStore, InMemoryBlobStore
 * memory/src/storage/registry — AdapterRegistry
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  InMemoryKVStore,
  InMemoryVectorStore,
  InMemoryGraphStore,
  InMemoryBlobStore,
} from "../../packages/memory/src/storage/inMemory";
import { AdapterRegistry } from "../../packages/memory/src/storage/registry";

// ===========================================================================
// InMemoryKVStore
// ===========================================================================
describe("InMemoryKVStore", () => {
  let store: InMemoryKVStore<string>;
  beforeEach(() => { store = new InMemoryKVStore<string>(); });

  it("put / get roundtrip", async () => {
    await store.put("k1", "value1");
    expect(await store.get("k1")).toBe("value1");
  });
  it("get returns null for missing key", async () => {
    expect(await store.get("missing")).toBeNull();
  });
  it("delete removes item", async () => {
    await store.put("k1", "v"); await store.delete("k1");
    expect(await store.get("k1")).toBeNull();
  });
  it("list returns all values", async () => {
    await store.put("a", "1"); await store.put("b", "2");
    expect(await store.list()).toHaveLength(2);
  });
  it("list respects limit", async () => {
    await store.put("a", "1"); await store.put("b", "2"); await store.put("c", "3");
    expect(await store.list({ limit: 2 })).toHaveLength(2);
  });
  it("clear removes all items", async () => {
    await store.put("k", "v"); await store.clear();
    expect(await store.list()).toHaveLength(0);
  });
  it("health() returns true", async () => { expect(await store.health()).toBe(true); });
});

// ===========================================================================
// InMemoryVectorStore
// ===========================================================================
describe("InMemoryVectorStore", () => {
  let store: InMemoryVectorStore;
  beforeEach(() => { store = new InMemoryVectorStore(); });

  it("upsertVector / queryVector roundtrip", async () => {
    await store.upsertVector({ id: "v1", vector: [1, 0, 0], payload: { text: "hello" } });
    const r = await store.queryVector({ vector: [1, 0, 0], limit: 5 });
    expect(r).toHaveLength(1);
    expect(r[0]!.id).toBe("v1");
    expect(r[0]!.score).toBeCloseTo(1.0, 3);
  });
  it("queryVector returns results sorted by score desc", async () => {
    await store.upsertVector({ id: "a", vector: [1, 0], payload: {} });
    await store.upsertVector({ id: "b", vector: [0, 1], payload: {} });
    const r = await store.queryVector({ vector: [1, 0], limit: 2 });
    expect(r[0]!.score).toBeGreaterThanOrEqual(r[1]!.score);
  });
  it("queryVector respects limit", async () => {
    for (let i = 0; i < 5; i++) await store.upsertVector({ id: `v${i}`, vector: [i, 0], payload: {} });
    expect(await store.queryVector({ vector: [1, 0], limit: 2 })).toHaveLength(2);
  });
  it("deleteVector removes entry", async () => {
    await store.upsertVector({ id: "v1", vector: [1, 0], payload: {} });
    await store.deleteVector("v1");
    expect(await store.queryVector({ vector: [1, 0], limit: 5 })).toHaveLength(0);
  });
  it("upsertVector overwrites existing entry", async () => {
    await store.upsertVector({ id: "v1", vector: [1, 0], payload: { text: "old" } });
    await store.upsertVector({ id: "v1", vector: [1, 0], payload: { text: "new" } });
    const r = await store.queryVector({ vector: [1, 0], limit: 5 });
    expect(r[0]!.payload.text).toBe("new");
  });
  it("clear removes all vectors", async () => {
    await store.upsertVector({ id: "v1", vector: [1, 0], payload: {} });
    await store.clear();
    expect(await store.queryVector({ vector: [1, 0], limit: 5 })).toHaveLength(0);
  });
  it("queryVector score is 0 for zero query vector", async () => {
    await store.upsertVector({ id: "v1", vector: [1, 0], payload: {} });
    const r = await store.queryVector({ vector: [0, 0], limit: 5 });
    expect(r[0]!.score).toBe(0);
  });
  it("health() returns true", async () => { expect(await store.health()).toBe(true); });
});

// ===========================================================================
// InMemoryGraphStore
// ===========================================================================
describe("InMemoryGraphStore", () => {
  let store: InMemoryGraphStore;
  beforeEach(() => { store = new InMemoryGraphStore(); });

  it("upsertEntities / queryGraph roundtrip", async () => {
    await store.upsertEntities([{ entityId: "e1", name: "AgenticFORGE", type: "software", frequency: 1, metadata: {} }]);
    const r = await store.queryGraph({ queryText: "AgenticFORGE", limit: 5 });
    expect(r[0]!.entityId).toBe("e1");
  });
  it("upsertEntities increments frequency on duplicate", async () => {
    const e = { entityId: "e1", name: "test", type: "t", frequency: 1, metadata: {} };
    await store.upsertEntities([e]); await store.upsertEntities([e]);
    const r = await store.queryGraph({ queryText: "test", limit: 1 });
    expect(r[0]!.entityId).toBe("e1");
  });
  it("queryGraph returns empty for unmatched text", async () => {
    await store.upsertEntities([{ entityId: "e1", name: "foo", type: "t", frequency: 1, metadata: {} }]);
    expect(await store.queryGraph({ queryText: "xyz", limit: 5 })).toHaveLength(0);
  });
  it("upsertRelations adds and deduplicates relations", async () => {
    const rel = { fromEntity: "a", toEntity: "b", relationType: "r", frequency: 1, strength: 0.5 };
    await store.upsertRelations([rel]); await store.upsertRelations([rel]);
  });
  it("deleteByMemoryId removes entity and its relations", async () => {
    await store.upsertEntities([{ entityId: "e1", name: "target", type: "t", frequency: 1, metadata: {} }]);
    await store.upsertRelations([{ fromEntity: "e1", toEntity: "e2", relationType: "r", frequency: 1, strength: 0.5 }]);
    await store.deleteByMemoryId("e1");
    expect(await store.queryGraph({ queryText: "target", limit: 5 })).toHaveLength(0);
  });
  it("clear removes all entities", async () => {
    await store.upsertEntities([{ entityId: "e1", name: "foo", type: "t", frequency: 1, metadata: {} }]);
    await store.clear();
    expect(await store.queryGraph({ queryText: "foo", limit: 5 })).toHaveLength(0);
  });
  it("health() returns true", async () => { expect(await store.health()).toBe(true); });
});

// ===========================================================================
// InMemoryBlobStore
// ===========================================================================
describe("InMemoryBlobStore", () => {
  let store: InMemoryBlobStore;
  beforeEach(() => { store = new InMemoryBlobStore(); });

  it("putBlob / getBlob roundtrip (string)", async () => {
    await store.putBlob("b1", "hello", { type: "text" });
    expect(await store.getBlob("b1")).toBe("hello");
  });
  it("putBlob / getBlob roundtrip (Buffer)", async () => {
    const buf = Buffer.from("binary");
    await store.putBlob("b2", buf);
    expect(await store.getBlob("b2")).toEqual(buf);
  });
  it("getBlob returns null for missing id", async () => {
    expect(await store.getBlob("missing")).toBeNull();
  });
  it("deleteBlob removes entry", async () => {
    await store.putBlob("b1", "data");
    await store.deleteBlob("b1");
    expect(await store.getBlob("b1")).toBeNull();
  });
  it("clear removes all blobs", async () => {
    await store.putBlob("b1", "x");
    await store.clear();
    expect(await store.getBlob("b1")).toBeNull();
  });
  it("health() returns true", async () => { expect(await store.health()).toBe(true); });
});

// ===========================================================================
// AdapterRegistry
// ===========================================================================
describe("AdapterRegistry", () => {
  it("register / getAdapters roundtrip", () => {
    const reg = new AdapterRegistry();
    const kv = new InMemoryKVStore();
    const vec = new InMemoryVectorStore();
    reg.register({ kvStore: kv as any, vectorStore: vec });
    expect(reg.getKVStore()).toBe(kv);
    expect(reg.getVectorStore()).toBe(vec);
  });
  it("getKVStore/getVectorStore/getGraphStore/getBlobStore return undefined when not set", () => {
    const reg = new AdapterRegistry();
    expect(reg.getKVStore()).toBeUndefined();
    expect(reg.getVectorStore()).toBeUndefined();
    expect(reg.getGraphStore()).toBeUndefined();
    expect(reg.getBlobStore()).toBeUndefined();
  });
  it("checkHealth() returns all-true when no adapters", async () => {
    const reg = new AdapterRegistry();
    const status = await reg.checkHealth();
    expect(Object.values(status).every(v => v)).toBe(true);
  });
  it("checkHealth() calls adapter health() method", async () => {
    const reg = new AdapterRegistry();
    const vec = new InMemoryVectorStore();
    reg.register({ vectorStore: vec });
    const status = await reg.checkHealth();
    expect(status.vectorStore).toBe(true);
  });
  it("isHealthy() returns true after healthy check", async () => {
    const reg = new AdapterRegistry();
    await reg.checkHealth();
    expect(reg.isHealthy()).toBe(true);
  });
  it("getLastHealthStatus() returns last check result", async () => {
    const reg = new AdapterRegistry();
    await reg.checkHealth();
    const status = reg.getLastHealthStatus();
    expect(typeof status.kvStore).toBe("boolean");
  });
  it("initialize() and shutdown() work without errors", async () => {
    const reg = new AdapterRegistry({ healthCheckInterval: 0 });
    const kv = new InMemoryKVStore();
    reg.register({ kvStore: kv as any });
    await reg.initialize();
    await reg.shutdown();
  });
  it("shutdown() clears adapter stores", async () => {
    const reg = new AdapterRegistry({ healthCheckInterval: 0 });
    const vec = new InMemoryVectorStore();
    await vec.upsertVector({ id: "v1", vector: [1, 0], payload: {} });
    reg.register({ vectorStore: vec });
    await reg.initialize();
    await reg.shutdown();
    expect(await vec.queryVector({ vector: [1, 0], limit: 5 })).toHaveLength(0);
  });
});
