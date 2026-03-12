import {QdrantClient} from "@qdrant/js-client-rest";
import type {VectorStoreAdapter} from "./types";

export interface QdrantVectorStoreOptions {
  url?: string;
  apiKey?: string;
  collection?: string;
  vectorSize?: number;
  distance?: "Cosine" | "Euclid" | "Dot";
  timeoutMs?: number;
}

export class QdrantVectorStore implements VectorStoreAdapter {
  private readonly client: QdrantClient;
  private readonly collection: string;
  private readonly vectorSize?: number;
  private readonly distance: "Cosine" | "Euclid" | "Dot";
  private collectionReady = false;

  static buildFilter(clauses: FilterClause[] = []): QdrantFilter | undefined {
    return buildQdrantFilter(clauses);
  }

  constructor(options: QdrantVectorStoreOptions = {}) {
    this.client = new QdrantClient({
      url: options.url ?? "http://localhost:6333",
      apiKey: options.apiKey,
      timeout: options.timeoutMs,
    });
    this.collection = options.collection ?? "memories";
    this.vectorSize = options.vectorSize ?? 384;
    this.distance = options.distance ?? "Cosine";
  }

  async upsertVector(params: {
    id: string;
    vector: number[];
    payload: Record<string, unknown>;
  }): Promise<void> {
    await this.ensureCollection(params.vector.length);
    await this.client.upsert(this.collection, {
      points: [
        {
          id: params.id,
          vector: params.vector,
          payload: params.payload,
        },
      ],
    });
  }

  async queryVector(params: {
    vector: number[];
    limit: number;
    filter?: QdrantFilter;
  }): Promise<Array<{id: string; score: number; payload: Record<string, unknown>}>> {
    await this.ensureCollection(params.vector.length);
    const res = await this.client.search(this.collection, {
      vector: params.vector,
      limit: params.limit,
      filter: params.filter,
    });

    return res.map((item) => ({
      id: String(item.id),
      score: item.score ?? 0,
      payload: (item.payload ?? {}) as Record<string, unknown>,
    }));
  }

  async deleteVector(id: string): Promise<void> {
    await this.client.delete(this.collection, {
      points: [id],
    });
  }

  async clear(): Promise<void> {
    const exists = await this.client.getCollections();
    const names = exists.collections.map((c) => c.name);
    if (names.includes(this.collection)) {
      await this.client.deleteCollection(this.collection);
    }
    this.collectionReady = false;
  }

  async health(): Promise<boolean> {
    try {
      await this.client.getCollections();
      return true;
    } catch {
      return false;
    }
  }

  private async ensureCollection(vectorSize: number): Promise<void> {
    if (this.collectionReady) return;
    const collections = await this.client.getCollections();
    const exists = collections.collections.some((c) => c.name === this.collection);
    if (!exists) {
      await this.client.createCollection(this.collection, {
        vectors: {
          size: this.vectorSize ?? vectorSize,
          distance: this.distance,
        },
      });
    }
    this.collectionReady = true;
  }
}

export type FilterValue = string | number | boolean | null;
export type RangeCondition = {
  gt?: number;
  gte?: number;
  lt?: number;
  lte?: number;
};
export type GeoPoint = {lat: number; lon: number};
export type GeoRadius = {center: GeoPoint; radius: number};
export type GeoBoundingBox = {top_left: GeoPoint; bottom_right: GeoPoint};

export type FilterClause = {
  key: string;
  value?: FilterValue | FilterValue[];
  range?: RangeCondition;
  geo_radius?: GeoRadius;
  geo_bounding_box?: GeoBoundingBox;
  operator?: "eq" | "in" | "range" | "geo_radius" | "geo_box";
};
export type QdrantFilter = {
  must?: Array<{
    key: string;
    match?: {value: FilterValue | FilterValue[]};
    range?: RangeCondition;
    geo_radius?: GeoRadius;
    geo_bounding_box?: GeoBoundingBox;
  }>;
  should?: Array<{
    key: string;
    match?: {value: FilterValue | FilterValue[]};
    range?: RangeCondition;
    geo_radius?: GeoRadius;
    geo_bounding_box?: GeoBoundingBox;
  }>;
  must_not?: Array<{
    key: string;
    match?: {value: FilterValue | FilterValue[]};
    range?: RangeCondition;
    geo_radius?: GeoRadius;
    geo_bounding_box?: GeoBoundingBox;
  }>;
};

export function buildQdrantFilter(
  clauses: FilterClause[] = [],
  mode: "must" | "should" | "must_not" = "must",
): QdrantFilter | undefined {
  const filtered = clauses.filter(
    (clause) =>
      clause.value !== undefined ||
      clause.range !== undefined ||
      clause.geo_radius !== undefined ||
      clause.geo_bounding_box !== undefined,
  );
  if (filtered.length === 0) return undefined;

  const conditions = filtered.map((clause) => {
    if (clause.operator === "range" || clause.range) {
      return {
        key: clause.key,
        range: clause.range,
      };
    }
    if (clause.operator === "geo_radius" || clause.geo_radius) {
      return {
        key: clause.key,
        geo_radius: clause.geo_radius,
      };
    }
    if (clause.operator === "geo_box" || clause.geo_bounding_box) {
      return {
        key: clause.key,
        geo_bounding_box: clause.geo_bounding_box,
      };
    }

    return {
      key: clause.key,
      match: {
        value:
          clause.operator === "in" && Array.isArray(clause.value)
            ? clause.value
            : clause.value,
      },
    };
  });

  return {[mode]: conditions};
}
