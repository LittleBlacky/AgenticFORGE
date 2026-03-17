import type {VectorStoreAdapter} from "../storage/types";
import {InMemoryVectorStore} from "../storage/inMemory";
import {QdrantVectorStore} from "../storage/qdrant";

export interface RagVectorStoreFactoryOptions {
  backend?: string;
  qdrantUrl?: string;
  qdrantApiKey?: string;
  qdrantCollection?: string;
  qdrantVectorSize?: number;
  qdrantDistance?: "Cosine" | "Euclid" | "Dot";
  qdrantTimeoutMs?: number;
}

type RagVectorStoreFactory = (options?: RagVectorStoreFactoryOptions) => VectorStoreAdapter;

let ragVectorStoreFactory: RagVectorStoreFactory | null = null;

export function registerRagVectorStoreFactory(factory: RagVectorStoreFactory): void {
  ragVectorStoreFactory = factory;
}

export function createDefaultVectorStore(
  options: RagVectorStoreFactoryOptions = {},
): VectorStoreAdapter {
  if (ragVectorStoreFactory) {
    return ragVectorStoreFactory(options);
  }

  const backend =
    options.backend ?? process.env.RAG_VECTOR_STORE_BACKEND ?? "memory";

  if (backend === "qdrant") {
    return new QdrantVectorStore({
      url: options.qdrantUrl ?? process.env.QDRANT_URL,
      apiKey: options.qdrantApiKey ?? process.env.QDRANT_API_KEY,
      collection:
        options.qdrantCollection ??
        process.env.QDRANT_COLLECTION_NAME ??
        "hello_agents_rag_vectors",
      vectorSize:
        options.qdrantVectorSize ??
        Number(process.env.QDRANT_VECTOR_SIZE ?? 384),
      distance:
        options.qdrantDistance ??
        (process.env.QDRANT_DISTANCE as "Cosine" | "Euclid" | "Dot" | undefined) ??
        "Cosine",
      timeoutMs:
        options.qdrantTimeoutMs ??
        Number(process.env.QDRANT_TIMEOUT ?? 30) * 1000,
    });
  }

  return new InMemoryVectorStore();
}
