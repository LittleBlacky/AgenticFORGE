import neo4j, {type Driver, type Session, type Integer} from "neo4j-driver";
import type {Entity, GraphStoreAdapter, Relation} from "./types";

export interface Neo4jGraphStoreOptions {
  uri?: string;
  user?: string;
  password?: string;
  database?: string;
  maxConnectionLifetime?: number;
  maxConnectionPoolSize?: number;
  connectionAcquisitionTimeout?: number;
}

export class Neo4jGraphStore implements GraphStoreAdapter {
  private readonly driver: Driver;
  private readonly database?: string;

  constructor(options: Neo4jGraphStoreOptions = {}) {
    const uri = options.uri ?? "neo4j://localhost:7687";
    const user = options.user ?? "neo4j";
    const password = options.password ?? "neo4j";

    this.driver = neo4j.driver(
      uri,
      neo4j.auth.basic(user, password),
      {
        maxConnectionLifetime: options.maxConnectionLifetime,
        maxConnectionPoolSize: options.maxConnectionPoolSize,
        connectionAcquisitionTimeout: options.connectionAcquisitionTimeout,
      },
    );
    this.database = options.database;
  }

  async upsertEntities(entities: Entity[]): Promise<void> {
    if (entities.length === 0) return;
    const session = this.openSession();
    try {
      const rows = entities.map((entity) => ({
        entityId: entity.entityId,
        name: entity.name,
        entityType: entity.entityType,
        description: entity.description,
        props: entity.properties,
        frequency: entity.frequency,
      }));

      await session.run(
        `UNWIND $rows AS row
         MERGE (e:Entity {entityId: row.entityId})
         SET e.name = row.name,
             e.entityType = row.entityType,
             e.description = row.description,
             e += row.props,
             e.frequency = coalesce(e.frequency, 0) + row.frequency`,
        {rows},
      );
    } finally {
      await session.close();
    }
  }

  async upsertRelations(relations: Relation[]): Promise<void> {
    if (relations.length === 0) return;
    const session = this.openSession();
    try {
      const rows = relations.map((rel) => ({
        fromEntity: rel.fromEntity,
        toEntity: rel.toEntity,
        relationType: rel.relationType,
        strength: rel.strength,
        evidence: rel.evidence,
        props: rel.properties,
        frequency: rel.frequency,
      }));

      await session.run(
        `UNWIND $rows AS row
         MERGE (a:Entity {entityId: row.fromEntity})
         MERGE (b:Entity {entityId: row.toEntity})
         MERGE (a)-[r:REL {relationType: row.relationType}]->(b)
         SET r.strength = coalesce(r.strength, 0) + row.strength,
             r.evidence = row.evidence,
             r += row.props,
             r.frequency = coalesce(r.frequency, 0) + row.frequency`,
        {rows},
      );
    } finally {
      await session.close();
    }
  }

  async queryGraph(params: {
    queryText: string;
    limit: number;
  }): Promise<Array<{entityId: string; score: number}>> {
    const tokens = params.queryText
      .toLowerCase()
      .split(/\s+/g)
      .filter(Boolean)
      .slice(0, 8);

    if (tokens.length === 0) return [];

    const session = this.openSession();
    try {
      const res = await session.run(
        `MATCH (e:Entity)
         WHERE toLower(e.name) IN $tokens
         RETURN e.entityId AS entityId, e.frequency AS frequency
         ORDER BY frequency DESC
         LIMIT $limit`,
        {tokens, limit: neo4j.int(Math.max(1, Math.floor(params.limit)))}
      );

      return res.records.map((record) => {
        const freq = record.get("frequency") as Integer | number | null;
        const score = typeof freq === "number" ? freq : freq?.toNumber() ?? 1;
        return {
          entityId: String(record.get("entityId")),
          score,
        };
      });
    } finally {
      await session.close();
    }
  }

  async deleteByMemoryId(memoryId: string): Promise<void> {
    const session = this.openSession();
    try {
      await session.run(
        `MATCH (e:Entity {entityId: $memoryId})
         DETACH DELETE e`,
        {memoryId},
      );
    } finally {
      await session.close();
    }
  }

  async clear(): Promise<void> {
    const session = this.openSession();
    try {
      await session.run("MATCH (n) DETACH DELETE n");
    } finally {
      await session.close();
    }
  }

  async health(): Promise<boolean> {
    const session = this.openSession();
    try {
      await session.run("RETURN 1 AS ok");
      return true;
    } catch {
      return false;
    } finally {
      await session.close();
    }
  }

  private openSession(): Session {
    return this.driver.session({database: this.database});
  }
}
