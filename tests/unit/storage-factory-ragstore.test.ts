import { describe, it, expect } from "vitest";
import { AdapterFactory } from "../../packages/memory/src/storage/factory";
import { createDefaultVectorStore, registerRagVectorStoreFactory } from "../../packages/memory/src/rag/storeFactory";
import { InMemoryVectorStore } from "../../packages/memory/src/storage/inMemory";
import { QdrantVectorStore } from "../../packages/memory/src/storage/qdrant";

describe("AdapterFactory", () => {
  it("createInMemory returns all adapters", () => {
    const adapters = AdapterFactory.createInMemory();
    expect(adapters.kvStore).toBeDefined();
    expect(adapters.vectorStore).toBeDefined();
    expect(adapters.graphStore).toBeDefined();
    expect(adapters.blobStore).toBeDefined();
  });

  it("create() currently returns in-memory adapters", () => {
    const adapters = AdapterFactory.create({ any: 1 });
    expect(adapters.kvStore).toBeDefined();
    expect(adapters.vectorStore).toBeDefined();
  });
});

describe("rag/storeFactory", () => {
  it("returns InMemoryVectorStore by default", () => {
    const store = createDefaultVectorStore({ backend: "memory" });
    expect(store).toBeInstanceOf(InMemoryVectorStore);
  });

  it("returns QdrantVectorStore when backend=qdrant", () => {
    const store = createDefaultVectorStore({ backend: "qdrant", qdrantUrl: "http://localhost:6333" });
    expect(store).toBeInstanceOf(QdrantVectorStore);
  });

  it("uses registered custom factory", () => {
    const custom = new InMemoryVectorStore();
    registerRagVectorStoreFactory(() => custom);
    const out = createDefaultVectorStore();
    expect(out).toBe(custom);
    // reset
    registerRagVectorStoreFactory(null as any);
  });
});
