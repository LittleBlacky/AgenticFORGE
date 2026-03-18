import OpenAI from "openai";

export interface TextEmbedder {
  encode(text: string | string[]): Promise<number[] | number[][]>;
}

export interface OpenAITextEmbedderOptions {
  model?: string;
  apiKey?: string;
  baseURL?: string;
  timeoutMs?: number;
}

/**
 * Deterministic hash-based embedder — no external dependencies, zero latency.
 * Useful as a fallback when no real embedding service is configured.
 */
export class HashTextEmbedder implements TextEmbedder {
  private readonly dimension: number;

  constructor(dimension = 384) {
    this.dimension = dimension;
  }

  async encode(text: string | string[]): Promise<number[] | number[][]> {
    if (Array.isArray(text)) {
      return text.map((t) => this.embedOne(t));
    }
    return this.embedOne(text);
  }

  private embedOne(text: string): number[] {
    const vec = new Array<number>(this.dimension).fill(0);
    const tokens = text.toLowerCase().split(/\s+/g).filter(Boolean);
    for (const token of tokens) {
      const h = simpleHash(token, this.dimension);
      vec[h] += 1;
    }
    const norm = Math.sqrt(vec.reduce((acc, n) => acc + n * n, 0));
    if (norm > 0) {
      return vec.map((n) => n / norm);
    }
    return vec;
  }
}

/** Pure JS djb2 hash → index, avoids crypto dependency in this module. */
function simpleHash(token: string, dimension: number): number {
  let h = 5381;
  for (let i = 0; i < token.length; i++) {
    h = ((h << 5) + h) ^ token.charCodeAt(i);
    h = h >>> 0; // keep unsigned 32-bit
  }
  return h % dimension;
}

/**
 * OpenAI-compatible text embedder (works with any OpenAI-compatible API).
 */
export class OpenAITextEmbedder implements TextEmbedder {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(options: OpenAITextEmbedderOptions = {}) {
    const model = options.model ?? process.env.EMBEDDING_MODEL_ID;
    const apiKey =
      options.apiKey ??
      process.env.EMBEDDING_API_KEY ??
      process.env.LLM_API_KEY;
    const baseURL =
      options.baseURL ??
      process.env.EMBEDDING_BASE_URL ??
      process.env.LLM_BASE_URL;
    const timeoutMs =
      options.timeoutMs ??
      Number(process.env.EMBEDDING_TIMEOUT ?? 60) * 1000;

    if (!model || !apiKey || !baseURL) {
      throw new Error(
        "EMBEDDING_MODEL_ID, EMBEDDING_API_KEY, EMBEDDING_BASE_URL 必须在参数或 .env 中提供"
      );
    }

    this.model = model;
    this.client = new OpenAI({apiKey, baseURL, timeout: timeoutMs});
  }

  async encode(text: string | string[]): Promise<number[] | number[][]> {
    if (Array.isArray(text)) {
      const response = await this.client.embeddings.create({
        model: this.model,
        input: text,
      });
      return response.data.map((item) => item.embedding.map((v) => Number(v)));
    }

    const response = await this.client.embeddings.create({
      model: this.model,
      input: text,
    });
    const first = response.data[0]?.embedding ?? [];
    return first.map((v) => Number(v));
  }
}
