import type {TextEmbedder} from "../rag/pipeline";
import {HashTextEmbedder, OpenAITextEmbedder} from "../rag/pipeline";

export function createDefaultTextEmbedder(dimension = 384): TextEmbedder {
  const model = process.env.EMBEDDING_MODEL_ID;
  const apiKey = process.env.EMBEDDING_API_KEY ?? process.env.LLM_API_KEY;
  const baseURL = process.env.EMBEDDING_BASE_URL ?? process.env.LLM_BASE_URL;

  if (model && apiKey && baseURL) {
    try {
      return new OpenAITextEmbedder({model, apiKey, baseURL});
    } catch {
      // fallback to hash embedder
    }
  }

  return new HashTextEmbedder(dimension);
}
