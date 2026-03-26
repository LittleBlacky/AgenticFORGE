import { describe, it, expect, vi, beforeEach } from "vitest";

const qdrantInstances = vi.hoisted(() => [] as any[]);
const QdrantClientMock = vi.hoisted(
  () =>
    class {
      upsert = vi.fn().mockResolvedValue(undefined);
      search = vi.fn().mockResolvedValue([]);
      delete = vi.fn().mockResolvedValue(undefined);
      getCollections = vi.fn().mockResolvedValue({ collections: [] });
      createCollection = vi.fn().mockResolvedValue(undefined);
      deleteCollection = vi.fn().mockResolvedValue(undefined);

      constructor() {
        qdrantInstances.push(this);
      }
    },
);

vi.mock("@qdrant/js-client-rest", () => ({
  QdrantClient: QdrantClientMock,
}));

import { QdrantVectorStore, buildQdrantFilter } from "../../packages/memory/src/storage/qdrant";

describe("buildQdrantFilter", () => {
  it("returns undefined for empty clauses", () => {
    expect(buildQdrantFilter([])).toBeUndefined();
  });

  it("builds match filter for eq/in", () => {
    const filter = buildQdrantFilter([
      { key: "user_id", value: "u1", operator: "eq" },
      { key: "tags", value: ["a", "b"], operator: "in" },
    ]);
    expect(filter?.must?.length).toBe(2);
  });

  it("builds range filter", () => {
    const filter = buildQdrantFilter([{ key: "score", range: { gte: 0.5 }, operator: "range" }]);
    expect(filter?.must?.[0]?.range).toEqual({ gte: 0.5 });
  });

  it("builds geo filters", () => {
    const geoRadius = buildQdrantFilter([
      {
        key: "loc",
        geo_radius: { center: { lat: 1, lon: 2 }, radius: 100 },
        operator: "geo_radius",
      },
    ]);
    expect(geoRadius?.must?.[0]?.geo_radius).toBeDefined();

    const geoBox = buildQdrantFilter(
      [
        {
          key: "loc",
          geo_bounding_box: { top_left: { lat: 2, lon: 1 }, bottom_right: { lat: 1, lon: 2 } },
          operator: "geo_box",
        },
      ],
      "should",
    );
    expect(geoBox?.should?.[0]?.geo_bounding_box).toBeDefined();
  });
});

describe("QdrantVectorStore", () => {
  beforeEach(() => {
    qdrantInstances.length = 0;
  });

  it("upsertVector ensures collection and upserts", async () => {
    const store = new QdrantVectorStore({ collection: "c1" });
    await store.upsertVector({ id: "1", vector: [0.1, 0.2], payload: { a: 1 } });

    const client = qdrantInstances[0]!;
    expect(client.getCollections).toHaveBeenCalled();
    expect(client.createCollection).toHaveBeenCalled();
    expect(client.upsert).toHaveBeenCalled();
  });

  it("queryVector maps results", async () => {
    const store = new QdrantVectorStore({ collection: "c2" });
    const client = qdrantInstances[0]!;
    client.getCollections.mockResolvedValueOnce({ collections: [{ name: "c2" }] });
    client.search.mockResolvedValueOnce([{ id: 123, score: 0.9, payload: { x: 1 } }]);

    const hits = await store.queryVector({
      vector: [0.1, 0.2],
      limit: 3,
      filter: { user_id: "u1" },
    });
    expect(hits).toEqual([{ id: "123", score: 0.9, payload: { x: 1 } }]);
  });

  it("deleteVector delegates to client", async () => {
    const store = new QdrantVectorStore({ collection: "c3" });
    await store.deleteVector("id1");
    const client = qdrantInstances[0]!;
    expect(client.delete).toHaveBeenCalled();
  });

  it("clear deletes collection when exists", async () => {
    const store = new QdrantVectorStore({ collection: "c4" });
    const client = qdrantInstances[0]!;
    client.getCollections.mockResolvedValueOnce({ collections: [{ name: "c4" }] });
    await store.clear();
    expect(client.deleteCollection).toHaveBeenCalledWith("c4");
  });

  it("health returns false on error", async () => {
    const store = new QdrantVectorStore({ collection: "c5" });
    const client = qdrantInstances[0]!;
    client.getCollections.mockRejectedValueOnce(new Error("down"));
    await expect(store.health()).resolves.toBe(false);
  });

  it("buildFilter static delegates", () => {
    const f = QdrantVectorStore.buildFilter([{ key: "k", value: "v" }]);
    expect(f?.must?.length).toBe(1);
  });
});
