import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSession = vi.hoisted(() => ({
  run: vi.fn(),
  close: vi.fn().mockResolvedValue(undefined),
}));

const mockDriver = vi.hoisted(() => ({
  session: vi.fn().mockReturnValue(mockSession),
}));

const mockNeo4j = vi.hoisted(() => ({
  driver: vi.fn().mockReturnValue(mockDriver),
  auth: { basic: vi.fn().mockReturnValue("auth") },
  int: vi.fn((n: number) => n),
}));

vi.mock("neo4j-driver", () => ({
  default: mockNeo4j,
  ...mockNeo4j,
}));

import { Neo4jGraphStore } from "../../packages/memory/src/storage/neo4j";

describe("Neo4jGraphStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDriver.session.mockReturnValue(mockSession);
    mockSession.run.mockReset();
    mockSession.close.mockReset();
    mockSession.close.mockResolvedValue(undefined);
  });
  it("constructs with defaults", () => {
    const store = new Neo4jGraphStore();
    expect(store).toBeDefined();
    expect(mockNeo4j.driver).toHaveBeenCalled();
  });

  it("upsertEntities no-op for empty input", async () => {
    const store = new Neo4jGraphStore();
    await store.upsertEntities([]);
    expect(mockSession.run).not.toHaveBeenCalled();
  });

  it("upsertEntities writes rows", async () => {
    mockSession.run.mockResolvedValueOnce({ records: [] });
    const store = new Neo4jGraphStore();
    await store.upsertEntities([
      {
        entityId: "e1",
        name: "Entity 1",
        entityType: "person",
        description: "desc",
        properties: { a: 1 },
        frequency: 1,
      },
    ]);
    expect(mockSession.run).toHaveBeenCalled();
    expect(mockSession.close).toHaveBeenCalled();
  });

  it("upsertRelations no-op for empty input", async () => {
    const store = new Neo4jGraphStore();
    await store.upsertRelations([]);
    expect(mockSession.run).not.toHaveBeenCalled();
  });

  it("upsertRelations writes rows", async () => {
    mockSession.run.mockResolvedValueOnce({ records: [] });
    const store = new Neo4jGraphStore();
    await store.upsertRelations([
      {
        fromEntity: "a",
        toEntity: "b",
        relationType: "knows",
        strength: 1,
        evidence: "e",
        properties: {},
        frequency: 1,
      },
    ]);
    expect(mockSession.run).toHaveBeenCalled();
  });

  it("queryGraph returns [] for empty tokens", async () => {
    const store = new Neo4jGraphStore();
    const out = await store.queryGraph({ queryText: "   ", limit: 5 });
    expect(out).toEqual([]);
  });

  it("queryGraph maps frequency number", async () => {
    mockSession.run.mockResolvedValueOnce({
      records: [
        { get: (k: string) => (k === "entityId" ? "e1" : 3) },
      ],
    });
    const store = new Neo4jGraphStore();
    const out = await store.queryGraph({ queryText: "Entity", limit: 5 });
    expect(out).toEqual([{ entityId: "e1", score: 3 }]);
  });

  it("deleteByMemoryId runs delete query", async () => {
    mockSession.run.mockResolvedValueOnce({});
    const store = new Neo4jGraphStore();
    await store.deleteByMemoryId("m1");
    expect(mockSession.run).toHaveBeenCalled();
  });

  it("clear runs detach delete", async () => {
    mockSession.run.mockResolvedValueOnce({});
    const store = new Neo4jGraphStore();
    await store.clear();
    expect(mockSession.run).toHaveBeenCalledWith("MATCH (n) DETACH DELETE n");
  });

  it("health false on error", async () => {
    mockSession.run.mockRejectedValueOnce(new Error("boom"));
    const store = new Neo4jGraphStore();
    await expect(store.health()).resolves.toBe(false);
  });
});
