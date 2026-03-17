import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import type {VectorStoreAdapter} from "../storage/types";
import {LLMClient} from "../../core/llm";
import {createDefaultTextEmbedder} from "../embedding";
import {createDefaultVectorStore} from "./storeFactory";

export interface RagChunkMetadata {
  source_path?: string;
  file_ext?: string;
  doc_id?: string;
  lang?: string;
  start?: number;
  end?: number;
  content_hash?: string;
  namespace?: string;
  source?: string;
  external?: boolean;
  heading_path?: string | null;
  format?: string;
  memory_id?: string;
  user_id?: string;
  memory_type?: string;
  content?: string;
  data_source?: string;
  rag_namespace?: string;
  is_rag_data?: boolean;
  [key: string]: unknown;
}

export interface RagChunk {
  id: string;
  content: string;
  metadata: RagChunkMetadata;
}

export interface VectorSearchHit {
  id: string;
  score: number;
  metadata: RagChunkMetadata;
}

export type VectorStore = VectorStoreAdapter;

export interface MarkitdownAdapter {
  convert: (filePath: string) => string;
}

export interface TextEmbedder {
  encode(text: string | string[]): Promise<number[] | number[][]>;
}

export interface OpenAITextEmbedderOptions {
  model?: string;
  apiKey?: string;
  baseURL?: string;
  timeoutMs?: number;
}

export interface RagPipeline {
  store: VectorStoreAdapter;
  namespace: string;
  addDocuments: (
    filePaths: string[],
    chunkSize?: number,
    chunkOverlap?: number,
  ) => Promise<number>;
  search: (
    query: string,
    topK?: number,
    scoreThreshold?: number,
  ) => Promise<VectorSearchHit[]>;
  searchAdvanced: (
    query: string,
    topK?: number,
    enableMqe?: boolean,
    enableHyde?: boolean,
    scoreThreshold?: number,
  ) => Promise<VectorSearchHit[]>;
  getStats: () => Promise<Record<string, unknown>>;
}

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
      const h = md5(token);
      const idx = Number.parseInt(h.slice(0, 8), 16) % this.dimension;
      vec[idx] += 1;
    }
    const norm = Math.sqrt(vec.reduce((acc, n) => acc + n * n, 0));
    if (norm > 0) {
      return vec.map((n) => n / norm);
    }
    return vec;
  }
}

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
      options.timeoutMs ?? Number(process.env.EMBEDDING_TIMEOUT ?? 60) * 1000;

    if (!model || !apiKey || !baseURL) {
      throw new Error(
        "EMBEDDING_MODEL_ID, EMBEDDING_API_KEY, EMBEDDING_BASE_URL 必须在参数或 .env 中提�?"
      );
    }

    this.model = model;
    this.client = new OpenAI({
      apiKey,
      baseURL,
      timeout: timeoutMs,
    });
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

export interface LoadAndChunkTextsOptions {
  paths: string[];
  chunkSize?: number;
  chunkOverlap?: number;
  namespace?: string;
  sourceLabel?: string;
  markitdownAdapter?: MarkitdownAdapter;
}

export interface LoadedDocument {
  filePath: string;
  ext: string;
  markdownText: string;
  lang: string;
  docId: string;
  paragraphs: Paragraph[];
}

export function isMarkitdownSupportedFormat(filePath: string): boolean {
  const ext = (path.extname(filePath) || "").toLowerCase();
  const supported = new Set([
    ".pdf",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".ppt",
    ".pptx",
    ".txt",
    ".md",
    ".csv",
    ".json",
    ".xml",
    ".html",
    ".htm",
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".bmp",
    ".tiff",
    ".tif",
    ".webp",
    ".mp3",
    ".wav",
    ".m4a",
    ".aac",
    ".flac",
    ".ogg",
    ".zip",
    ".tar",
    ".gz",
    ".rar",
    ".py",
    ".js",
    ".ts",
    ".java",
    ".cpp",
    ".c",
    ".h",
    ".css",
    ".scss",
    ".log",
    ".conf",
    ".ini",
    ".cfg",
    ".yaml",
    ".yml",
    ".toml",
  ]);

  return supported.has(ext);
}

export function fallbackTextReader(filePath: string): string {
  if (!fs.existsSync(filePath)) {
    return "";
  }
  const buffer = fs.readFileSync(filePath);
  return buffer.toString("utf-8");
}

export function convertToMarkdown(
  filePath: string,
  markitdownAdapter?: MarkitdownAdapter,
): string {
  if (!fs.existsSync(filePath)) {
    return "";
  }

  if (markitdownAdapter && isMarkitdownSupportedFormat(filePath)) {
    try {
      const text = markitdownAdapter.convert(filePath);
      if (typeof text === "string" && text.trim()) {
        return text;
      }
    } catch {
      // fall through to local reader
    }
  }

  return fallbackTextReader(filePath);
}

export function postProcessPdfText(text: string): string {
  const lines = text.split(/\r?\n/g);
  const cleaned: string[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      continue;
    }
    if (line.length <= 2 && !/^\d+$/.test(line)) {
      continue;
    }
    if (/^\d+$/.test(line)) {
      continue;
    }
    const lower = line.toLowerCase();
    if (["github", "project", "forks", "stars", "language"].includes(lower)) {
      continue;
    }
    cleaned.push(line);
  }

  return cleaned.join("\n");
}

export function detectLang(sample: string): string {
  if (!sample.trim()) {
    return "unknown";
  }
  const cjkCount = [...sample].filter((ch) => isCjk(ch)).length;
  const ratio = cjkCount / Math.max(1, sample.length);
  if (ratio > 0.2) {
    return "zh";
  }
  return "en";
}

export function isCjk(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  return (
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0xf900 && code <= 0xfaff)
  );
}

export function approxTokenLen(text: string): number {
  const cjk = [...text].filter((ch) => isCjk(ch)).length;
  const nonCjkTokens = text.split(/\s+/g).filter(Boolean).length;
  return cjk + nonCjkTokens;
}

interface Paragraph {
  content: string;
  heading_path: string | null;
  start: number;
  end: number;
}

export function splitParagraphsWithHeadings(text: string): Paragraph[] {
  const lines = text.split(/\r?\n/g);
  let charPos = 0;
  let headingStack: string[] = [];
  let buf: string[] = [];
  const paragraphs: Paragraph[] = [];

  const flush = (endPos: number): void => {
    if (buf.length === 0) {
      return;
    }
    const content = buf.join("\n").trim();
    if (!content) {
      buf = [];
      return;
    }
    paragraphs.push({
      content,
      heading_path: headingStack.length > 0 ? headingStack.join(" > ") : null,
      start: Math.max(0, endPos - content.length),
      end: endPos,
    });
    buf = [];
  };

  for (const line of lines) {
    if (line.trim().startsWith("#")) {
      flush(charPos);
      const level = Math.max(1, line.length - line.replace(/^#+/, "").length);
      const title = line.replace(/^#+/, "").trim();
      if (level <= headingStack.length) {
        headingStack = headingStack.slice(0, level - 1);
      }
      headingStack.push(title);
      charPos += line.length + 1;
      continue;
    }

    if (!line.trim()) {
      flush(charPos);
    } else {
      buf.push(line);
    }
    charPos += line.length + 1;
  }

  flush(charPos);

  if (paragraphs.length === 0) {
    return [{content: text, heading_path: null, start: 0, end: text.length}];
  }

  return paragraphs;
}

interface TokenChunk {
  content: string;
  start: number;
  end: number;
  heading_path: string | null;
}

export function chunkParagraphs(
  paragraphs: Paragraph[],
  chunkTokens: number,
  overlapTokens: number,
): TokenChunk[] {
  const chunks: TokenChunk[] = [];
  let cur: Paragraph[] = [];
  let curTokens = 0;
  let i = 0;

  while (i < paragraphs.length) {
    const p = paragraphs[i];
    const pt = Math.max(1, approxTokenLen(p.content));

    if (curTokens + pt <= chunkTokens || cur.length === 0) {
      cur.push(p);
      curTokens += pt;
      i += 1;
      continue;
    }

    chunks.push(emitChunk(cur));

    if (overlapTokens > 0) {
      const kept: Paragraph[] = [];
      let keptTokens = 0;
      for (let j = cur.length - 1; j >= 0; j -= 1) {
        const t = Math.max(1, approxTokenLen(cur[j].content));
        if (keptTokens + t > overlapTokens) {
          break;
        }
        kept.unshift(cur[j]);
        keptTokens += t;
      }
      cur = kept;
      curTokens = keptTokens;
    } else {
      cur = [];
      curTokens = 0;
    }
  }

  if (cur.length > 0) {
    chunks.push(emitChunk(cur));
  }

  return chunks;
}

function emitChunk(paragraphs: Paragraph[]): TokenChunk {
  const content = paragraphs.map((p) => p.content).join("\n\n");
  const heading =
    [...paragraphs].reverse().find((p) => p.heading_path)?.heading_path ?? null;
  return {
    content,
    start: paragraphs[0].start,
    end: paragraphs[paragraphs.length - 1].end,
    heading_path: heading,
  };
}

export function loadDocuments(
  options: LoadAndChunkTextsOptions,
): LoadedDocument[] {
  const {paths, markitdownAdapter} = options;
  const loaded: LoadedDocument[] = [];

  for (const filePath of paths) {
    if (!fs.existsSync(filePath)) {
      continue;
    }

    const ext = (path.extname(filePath) || "").toLowerCase();
    const markdownText = convertToMarkdown(filePath, markitdownAdapter);
    if (!markdownText.trim()) {
      continue;
    }

    const lang = detectLang(markdownText);
    const docId = md5(`${filePath}|${markdownText.length}`);
    const paragraphs = splitParagraphsWithHeadings(markdownText);

    loaded.push({
      filePath,
      ext,
      markdownText,
      lang,
      docId,
      paragraphs,
    });
  }

  return loaded;
}

export function loadAndChunkTexts(
  options: LoadAndChunkTextsOptions,
): RagChunk[] {
  const {
    chunkSize = 800,
    chunkOverlap = 100,
    namespace,
    sourceLabel = "rag",
  } = options;

  const chunks: RagChunk[] = [];
  const seenHashes = new Set<string>();
  const loadedDocs = loadDocuments(options);

  for (const doc of loadedDocs) {
    const tokenChunks = chunkParagraphs(
      doc.paragraphs,
      Math.max(1, chunkSize),
      Math.max(0, chunkOverlap),
    );

    for (const ch of tokenChunks) {
      const norm = ch.content.trim();
      if (!norm) {
        continue;
      }
      const contentHash = md5(norm);
      if (seenHashes.has(contentHash)) {
        continue;
      }
      seenHashes.add(contentHash);

      const chunkId = md5(`${doc.docId}|${ch.start}|${ch.end}|${contentHash}`);
      chunks.push({
        id: chunkId,
        content: ch.content,
        metadata: {
          source_path: doc.filePath,
          file_ext: doc.ext,
          doc_id: doc.docId,
          lang: doc.lang,
          start: ch.start,
          end: ch.end,
          content_hash: contentHash,
          namespace: namespace ?? "default",
          source: sourceLabel,
          external: true,
          heading_path: ch.heading_path,
          format: "markdown",
        },
      });
    }
  }

  return chunks;
}

export function buildGraphFromChunks(
  neo4j: {
    addEntity: (input: {
      entity_id: string;
      name: string;
      entity_type: string;
      properties: Record<string, unknown>;
    }) => void;
    addRelationship: (input: {
      from_id: string;
      to_id: string;
      rel_type: string;
      properties: Record<string, unknown>;
    }) => void;
  },
  chunks: RagChunk[],
): void {
  const createdDocs = new Set<string>();
  for (const chunk of chunks) {
    const memId = chunk.id;
    const meta = chunk.metadata;
    const sourcePath =
      typeof meta.source_path === "string" ? meta.source_path : undefined;
    const docId = typeof meta.doc_id === "string" ? meta.doc_id : undefined;

    if (docId && !createdDocs.has(docId)) {
      createdDocs.add(docId);
      try {
        neo4j.addEntity({
          entity_id: docId,
          name: path.basename(sourcePath ?? docId),
          entity_type: "Document",
          properties: {source_path: sourcePath, lang: meta.lang},
        });
      } catch {}
    }

    try {
      neo4j.addEntity({
        entity_id: memId,
        name: memId,
        entity_type: "Memory",
        properties: {
          source_path: sourcePath,
          doc_id: docId,
          start: meta.start,
          end: meta.end,
        },
      });
    } catch {}

    if (docId) {
      try {
        neo4j.addRelationship({
          from_id: docId,
          to_id: memId,
          rel_type: "HAS_CHUNK",
          properties: {},
        });
      } catch {}
    }
  }
}

export function preprocessMarkdownForEmbedding(text: string): string {
  let out = text;
  out = out.replace(/^#{1,6}\s+/gm, "");
  out = out.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  out = out.replace(/\*\*([^*]+)\*\*/g, "$1");
  out = out.replace(/\*([^*]+)\*/g, "$1");
  out = out.replace(/`([^`]+)`/g, "$1");
  out = out.replace(/```[^\n]*\n([\s\S]*?)```/g, "$1");
  out = out.replace(/\n\s*\n/g, "\n\n");
  out = out.replace(/[ \t]+/g, " ");
  return out.trim();
}

export function buildRagMetadata(
  chunk: RagChunk,
  ragNamespace = "default",
  userId = "rag_user",
): RagChunkMetadata {
  return {
    memory_id: chunk.id,
    user_id: userId,
    memory_type: "rag_chunk",
    content: chunk.content,
    data_source: "rag_pipeline",
    rag_namespace: ragNamespace,
    is_rag_data: true,
    ...chunk.metadata,
  };
}

export interface IndexChunksOptions {
  store: VectorStoreAdapter;
  chunks?: RagChunk[];
  batchSize?: number;
  ragNamespace?: string;
  ragUserId?: string;
  embedder?: TextEmbedder;
  dimension?: number;
}

export async function indexChunks(options: IndexChunksOptions): Promise<void> {
  const {
    chunks = [],
    batchSize = 64,
    ragNamespace = "default",
    ragUserId = "rag_user",
    dimension = 384,
  } = options;

  if (chunks.length === 0) {
    return;
  }

  if (!options.store) {
    throw new Error("VectorStoreAdapter is required for indexChunks");
  }

  const embedder = options.embedder ?? new HashTextEmbedder(dimension);
  const store = options.store;

  const processedTexts = chunks.map((c) =>
    preprocessMarkdownForEmbedding(c.content),
  );
  const vectors: number[][] = [];

  for (let i = 0; i < processedTexts.length; i += batchSize) {
    const part = processedTexts.slice(i, i + batchSize);
    const raw = await embedder.encode(part);
    const partVecs = normalize2DVectors(raw, dimension, part.length);
    vectors.push(...partVecs);
  }

  const metadata: RagChunkMetadata[] = [];
  const ids: string[] = [];
  for (const ch of chunks) {
    metadata.push(buildRagMetadata(ch, ragNamespace, ragUserId));
    ids.push(ch.id);
  }

  for (let i = 0; i < ids.length; i++) {
    await store.upsertVector({
      id: ids[i],
      vector: vectors[i],
      payload: metadata[i] as Record<string, unknown>,
    });
  }
}

export async function embedQuery(
  query: string,
  embedder?: TextEmbedder,
  dimension = 384,
): Promise<number[]> {
  const emb = embedder ?? new HashTextEmbedder(dimension);
  const raw = await emb.encode(query);
  return normalize1DVector(raw, dimension);
}

export interface RagQueryOptions {
  topK?: number;
  ragNamespace?: string;
  onlyRagData?: boolean;
  scoreThreshold?: number;
  enableMqe?: boolean;
  mqeExpansions?: number;
  enableHyde?: boolean;
  candidatePoolMultiplier?: number;
}

export interface SearchVectorsOptions {
  store: VectorStoreAdapter;
  query: string;
  options?: RagQueryOptions;
  embedder?: TextEmbedder;
  dimension?: number;
}

export async function searchVectors(
  options: SearchVectorsOptions,
): Promise<VectorSearchHit[]> {
  const {
    query,
    dimension = 384,
  } = options;
  const {
    topK = 8,
    ragNamespace,
    onlyRagData = true,
    scoreThreshold,
  } = options.options ?? {};

  if (!query.trim()) {
    return [];
  }

  if (!options.store) {
    throw new Error("VectorStoreAdapter is required for searchVectors");
  }

  const store = options.store;
  const queryVector = await embedQuery(query, options.embedder, dimension);

  const where: Record<string, unknown> = {memory_type: "rag_chunk"};
  if (onlyRagData) {
    where.is_rag_data = true;
    where.data_source = "rag_pipeline";
  }
  if (ragNamespace) {
    where.rag_namespace = ragNamespace;
  }

  const rawHits = await store.queryVector({
    vector: queryVector,
    limit: topK,
    filter: where,
  });
  return rawHits
    .filter(h => scoreThreshold === undefined || h.score >= scoreThreshold)
    .map(h => ({id: h.id, score: h.score, metadata: h.payload as RagChunkMetadata}));
}

async function promptMqe(
  query: string,
  n: number,
  llm?: LLMClient,
): Promise<string[]> {
  try {
    const client = llm ?? new LLMClient();
    const text = await client.think([
      {
        role: "system",
        content:
          "你是检索查询扩展助手。生成语义等价或互补的多样化查询。使用中文，简短，避免标点。",
      },
      {
        role: "user",
        content: `原始查询?{query}\n请给?{n}个不同表述的查询，每行一个。`,
      },
    ]);
    const lines = text
      .split(/\r?\n/g)
      .map((line) => line.replace(/^[-\s]+/, "").trim())
      .filter(Boolean);
    return lines.slice(0, n).length > 0 ? lines.slice(0, n) : [query];
  } catch {
    return [query];
  }
}

async function promptHyde(
  query: string,
  llm?: LLMClient,
): Promise<string | null> {
  try {
    const client = llm ?? new LLMClient();
    return await client.think([
      {
        role: "system",
        content:
          "根据用户问题，先写一段可能的答案性段落，用于向量检索的查询文档（不要分析过程）?",
      },
      {
        role: "user",
        content: `问题�?{query}\n请直接写一段中等长度、客观、包含关键术语的段落。`,
      },
    ]);
  } catch {
    return null;
  }
}

export interface SearchVectorsExpandedOptions extends SearchVectorsOptions {
  llm?: LLMClient;
}

export async function searchVectorsExpanded(
  options: SearchVectorsExpandedOptions,
): Promise<VectorSearchHit[]> {
  const {query, dimension = 384} = options;
  const {
    topK = 8,
    ragNamespace,
    onlyRagData = true,
    scoreThreshold,
    enableMqe = false,
    mqeExpansions = 2,
    enableHyde = false,
    candidatePoolMultiplier = 4,
  } = options.options ?? {};

  if (!query.trim()) {
    return [];
  }

  if (!options.store) {
    throw new Error("VectorStoreAdapter is required for searchVectorsExpanded");
  }

  const store = options.store;
  const expansions: string[] = [query];

  if (enableMqe && mqeExpansions > 0) {
    expansions.push(...(await promptMqe(query, mqeExpansions, options.llm)));
  }
  if (enableHyde) {
    const hyde = await promptHyde(query, options.llm);
    if (hyde) {
      expansions.push(hyde);
    }
  }

  const uniq = [...new Set(expansions.filter(Boolean))];
  const pool = Math.max(topK * candidatePoolMultiplier, 20);
  const per = Math.max(1, Math.floor(pool / Math.max(1, uniq.length)));

  const where: Record<string, unknown> = {memory_type: "rag_chunk"};
  if (onlyRagData) {
    where.is_rag_data = true;
    where.data_source = "rag_pipeline";
  }
  if (ragNamespace) {
    where.rag_namespace = ragNamespace;
  }

  const agg = new Map<string, VectorSearchHit>();
  for (const q of uniq) {
    const qv = await embedQuery(q, options.embedder, dimension);
    const rawHits2 = await store.queryVector({
      vector: qv,
      limit: per,
      filter: where,
    });
    const hits = rawHits2
      .filter(h => scoreThreshold === undefined || h.score >= scoreThreshold)
      .map(h => ({id: h.id, score: h.score, metadata: h.payload as RagChunkMetadata}));
    for (const hit of hits) {
      const mid = String(hit.metadata.memory_id ?? hit.id);
      const prev = agg.get(mid);
      if (!prev || hit.score > prev.score) {
        agg.set(mid, hit);
      }
    }
  }

  const merged = [...agg.values()].sort((a, b) => b.score - a.score);
  return merged.slice(0, topK);
}

export async function rerankWithCrossEncoder(
  query: string,
  items: Array<Record<string, unknown>>,
  topK = 10,
  reranker?: (
    queryText: string,
    candidates: Array<Record<string, unknown>>,
  ) => Promise<number[]>,
): Promise<Array<Record<string, unknown>>> {
  if (!items.length || !reranker) {
    return items.slice(0, topK);
  }

  try {
    const scores = await reranker(query, items);
    const cloned: Array<Record<string, unknown> & {rerank_score: number}> =
      items.map((item, idx) => ({
        ...item,
        rerank_score: Number(scores[idx] ?? 0),
      }));

    const getRankScore = (item: Record<string, unknown> & {rerank_score: number}): number => {
      const base = item["score"];
      const baseNum = typeof base === "number" ? base : Number(base ?? 0);
      return Number(item.rerank_score ?? baseNum);
    };

    cloned.sort((a, b) => getRankScore(b) - getRankScore(a));
    return cloned.slice(0, topK);
  } catch {
    return items.slice(0, topK);
  }
}

export function computeGraphSignalsFromPool(
  vectorHits: Array<Record<string, unknown>>,
  sameDocWeight = 1,
  proximityWeight = 1,
  proximityWindowChars = 1600,
): Record<string, number> {
  const byDoc: Record<string, Array<Record<string, unknown>>> = {};

  for (const hit of vectorHits) {
    const meta = toMetadata(hit.metadata);
    const docId = String(meta.doc_id ?? meta.memory_id ?? hit.id ?? "unknown");
    byDoc[docId] ??= [];
    byDoc[docId].push(hit);
  }

  const docCounts = Object.fromEntries(
    Object.entries(byDoc).map(([k, arr]) => [k, arr.length]),
  );
  const maxCount = Math.max(1, ...Object.values(docCounts));

  const graphSignal: Record<string, number> = {};

  for (const [docId, arr] of Object.entries(byDoc)) {
    arr.sort(
      (a, b) =>
        Number(toMetadata(a.metadata).start ?? 0) -
        Number(toMetadata(b.metadata).start ?? 0),
    );
    const density = (docCounts[docId] ?? 1) / maxCount;

    for (let i = 0; i < arr.length; i += 1) {
      const cur = arr[i];
      const curMeta = toMetadata(cur.metadata);
      const mid = String(curMeta.memory_id ?? cur.id ?? `hit-${i}`);
      const posI = Number(curMeta.start ?? 0);
      let prox = 0;

      for (let j = i - 1; j >= 0; j -= 1) {
        const posJ = Number(toMetadata(arr[j].metadata).start ?? 0);
        const dist = Math.abs(posI - posJ);
        if (dist > proximityWindowChars) {
          break;
        }
        prox += Math.max(0, 1 - dist / Math.max(1, proximityWindowChars));
      }

      for (let j = i + 1; j < arr.length; j += 1) {
        const posJ = Number(toMetadata(arr[j].metadata).start ?? 0);
        const dist = Math.abs(posI - posJ);
        if (dist > proximityWindowChars) {
          break;
        }
        prox += Math.max(0, 1 - dist / Math.max(1, proximityWindowChars));
      }

      graphSignal[mid] =
        (graphSignal[mid] ?? 0) +
        sameDocWeight * density +
        proximityWeight * prox;
    }
  }

  const maxV = Math.max(0, ...Object.values(graphSignal));
  if (maxV > 0) {
    for (const key of Object.keys(graphSignal)) {
      graphSignal[key] = graphSignal[key] / maxV;
    }
  }

  return graphSignal;
}

export function rank(
  vectorHits: VectorSearchHit[],
  graphSignals: Record<string, number> = {},
  wVector = 0.7,
  wGraph = 0.3,
): Array<Record<string, unknown>> {
  const items = vectorHits.map((h) => {
    const mid = String(h.metadata.memory_id ?? h.id);
    const g = Number(graphSignals[mid] ?? 0);
    const v = Number(h.score ?? 0);
    return {
      memory_id: mid,
      score: wVector * v + wGraph * g,
      vector_score: v,
      graph_score: g,
      content: String(h.metadata.content ?? ""),
      metadata: h.metadata,
    };
  });

  items.sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0));
  return items;
}

export function mergeSnippets(
  rankedItems: Array<Record<string, unknown>>,
  maxChars = 1200,
): string {
  const out: string[] = [];
  let total = 0;

  for (const it of rankedItems) {
    const text = String(it.content ?? "").trim();
    if (!text) {
      continue;
    }
    if (total + text.length > maxChars) {
      const remain = maxChars - total;
      if (remain <= 0) {
        break;
      }
      out.push(text.slice(0, remain));
      break;
    }
    out.push(text);
    total += text.length;
  }

  return out.join("\n\n");
}

export function expandNeighborsFromPool(
  selected: Array<Record<string, unknown>>,
  pool: Array<Record<string, unknown>>,
  neighbors = 1,
  maxAdditions = 5,
): Array<Record<string, unknown>> {
  if (!selected.length || !pool.length || neighbors <= 0) {
    return selected;
  }

  const byDoc: Record<string, Array<Record<string, unknown>>> = {};
  for (const item of pool) {
    const did = String(toMetadata(item.metadata).doc_id ?? "");
    if (!did) {
      continue;
    }
    byDoc[did] ??= [];
    byDoc[did].push(item);
  }

  for (const arr of Object.values(byDoc)) {
    arr.sort(
      (a, b) =>
        Number(toMetadata(a.metadata).start ?? 0) -
        Number(toMetadata(b.metadata).start ?? 0),
    );
  }

  const selectedIds = new Set(
    selected.map((it) => String(it.memory_id ?? it.id ?? "")),
  );
  const additions: Array<Record<string, unknown>> = [];

  for (const item of selected) {
    const meta = toMetadata(item.metadata);
    const did = String(meta.doc_id ?? "");
    if (!did || !byDoc[did]) {
      continue;
    }

    const arr = byDoc[did];
    const idx = arr.findIndex(
      (x) =>
        String(x.memory_id ?? x.id ?? "") ===
        String(item.memory_id ?? item.id ?? ""),
    );
    if (idx < 0) {
      continue;
    }

    for (let offset = 1; offset <= neighbors; offset += 1) {
      for (const j of [idx - offset, idx + offset]) {
        if (j < 0 || j >= arr.length) {
          continue;
        }
        const cand = arr[j];
        const mid = String(cand.memory_id ?? cand.id ?? "");
        if (!selectedIds.has(mid)) {
          additions.push(cand);
          selectedIds.add(mid);
          if (additions.length >= maxAdditions) {
            break;
          }
        }
      }
      if (additions.length >= maxAdditions) {
        break;
      }
    }
    if (additions.length >= maxAdditions) {
      break;
    }
  }

  const extended = [...selected, ...additions];
  const getSortScore = (item: Record<string, unknown>): number => {
    const rerank = item["rerank_score"];
    if (typeof rerank === "number") {
      return rerank;
    }
    const base = item["score"];
    return typeof base === "number" ? base : Number(base ?? 0);
  };

  extended.sort((a, b) => getSortScore(b) - getSortScore(a));
  return extended;
}

export function mergeSnippetsGrouped(
  rankedItems: Array<Record<string, unknown>>,
  maxChars = 1200,
  includeCitations = true,
): string {
  const byDoc: Record<string, Array<Record<string, unknown>>> = {};
  const docScore: Record<string, number> = {};

  for (const it of rankedItems) {
    const meta = toMetadata(it.metadata);
    const did = String(meta.doc_id ?? meta.source_path ?? "unknown");
    byDoc[did] ??= [];
    byDoc[did].push(it);
    docScore[did] = (docScore[did] ?? 0) + Number(it.score ?? 0);
  }

  const orderedDocs = Object.keys(byDoc).sort(
    (a, b) => (docScore[b] ?? 0) - (docScore[a] ?? 0),
  );
  for (const did of orderedDocs) {
    byDoc[did].sort(
      (a, b) =>
        Number(toMetadata(a.metadata).start ?? 0) -
        Number(toMetadata(b.metadata).start ?? 0),
    );
  }

  const out: string[] = [];
  const citations: Array<Record<string, unknown>> = [];
  let total = 0;
  let citeIndex = 1;

  outer: for (const did of orderedDocs) {
    for (const it of byDoc[did]) {
      const text = String(it.content ?? "").trim();
      if (!text) {
        continue;
      }
      const suffix = includeCitations ? ` [${citeIndex}]` : "";
      const need = text.length + suffix.length;
      if (total + need > maxChars) {
        const remain = maxChars - total;
        if (remain <= 0) {
          break outer;
        }
        const clipped = text.slice(0, Math.max(0, remain - suffix.length));
        if (clipped) {
          out.push(clipped + suffix);
          total += clipped.length + suffix.length;
          if (includeCitations) {
            const m = toMetadata(it.metadata);
            citations.push({
              index: citeIndex,
              source_path: m.source_path,
              doc_id: m.doc_id,
              start: m.start,
              end: m.end,
              heading_path: m.heading_path,
            });
            citeIndex += 1;
          }
        }
        break outer;
      }

      out.push(text + suffix);
      total += need;
      if (includeCitations) {
        const m = toMetadata(it.metadata);
        citations.push({
          index: citeIndex,
          source_path: m.source_path,
          doc_id: m.doc_id,
          start: m.start,
          end: m.end,
          heading_path: m.heading_path,
        });
        citeIndex += 1;
      }
    }
  }

  const merged = out.join("\n\n");
  if (!includeCitations || citations.length === 0) {
    return merged;
  }

  const lines: string[] = [merged, "", "References:"];
  for (const c of citations) {
    const start = c.start;
    const end = c.end;
    const loc =
      start !== undefined && end !== undefined ? ` (${start}-${end})` : "";
    const hp = c.heading_path ? ` �?${String(c.heading_path)}` : "";
    const sp = String(c.source_path ?? c.doc_id ?? "source");
    lines.push(`[${c.index}] ${sp}${loc}${hp}`);
  }
  return lines.join("\n");
}

export function compressRankedItems(
  rankedItems: Array<Record<string, unknown>>,
  enableCompression = true,
  maxPerDoc = 2,
  joinGap = 200,
): Array<Record<string, unknown>> {
  if (!enableCompression) {
    return rankedItems;
  }

  const byDocCount: Record<string, number> = {};
  const lastByDoc: Record<string, Record<string, unknown>> = {};
  const next: Array<Record<string, unknown>> = [];

  for (const item of rankedItems) {
    const meta = toMetadata(item.metadata);
    const did = String(meta.doc_id ?? meta.source_path ?? "unknown");
    const start = Number(meta.start ?? 0);
    const end = Number(meta.end ?? start + String(item.content ?? "").length);

    if (!lastByDoc[did]) {
      lastByDoc[did] = item;
      byDocCount[did] = 1;
      next.push(item);
      continue;
    }

    const last = lastByDoc[did];
    const lastMeta = toMetadata(last.metadata);
    const lastStart = Number(lastMeta.start ?? 0);
    const lastEnd = Number(
      lastMeta.end ?? lastStart + String(last.content ?? "").length,
    );

    if (start - lastEnd <= joinGap && start >= lastStart) {
      const mergedText = [
        String(last.content ?? "").trim(),
        String(item.content ?? "").trim(),
      ]
        .filter(Boolean)
        .join("\n\n");
      last.content = mergedText;
      lastMeta.end = Math.max(lastEnd, end);
      const ls = Number(last.score ?? 0);
      const cs = Number(item.score ?? 0);
      last.score = Math.max(ls, cs);
      lastByDoc[did] = last;
    } else {
      const cnt = byDocCount[did] ?? 0;
      if (cnt >= maxPerDoc) {
        continue;
      }
      next.push(item);
      lastByDoc[did] = item;
      byDocCount[did] = cnt + 1;
    }
  }

  return next;
}

export async function tldrSummarize(
  text: string,
  bullets = 3,
  llm?: LLMClient,
): Promise<string | null> {
  if (!text.trim()) {
    return null;
  }

  try {
    const client = llm ?? new LLMClient();
    return await client.think([
      {
        role: "system",
        content:
          "请将以下内容概括为简洁的要点列表（3-5条），用中文，避免重复，突出关键信息?",
      },
      {
        role: "user",
        content: `请用 ${Math.max(1, Math.min(5, Math.floor(bullets)))} 条要点总结：\n\n${text}`,
      },
    ]);
  } catch {
    return null;
  }
}

export interface CreateRagPipelineOptions {
  ragNamespace?: string;
  ragUserId?: string;
  store?: VectorStoreAdapter;
  embedder?: TextEmbedder;
  dimension?: number;
  markitdownAdapter?: MarkitdownAdapter;
}

export function createRagPipeline(
  options: CreateRagPipelineOptions = {},
): RagPipeline {
  const ragNamespace = options.ragNamespace ?? "default";
  const ragUserId = options.ragUserId ?? "rag_user";
  const dimension = options.dimension ?? 384;
  const store = options.store ?? createDefaultVectorStore();
  const embedder = options.embedder ?? createDefaultTextEmbedder(dimension);

  const addDocuments = async (
    filePaths: string[],
    chunkSize = 800,
    chunkOverlap = 100,
  ): Promise<number> => {
    const chunks = loadAndChunkTexts({
      paths: filePaths,
      chunkSize,
      chunkOverlap,
      namespace: ragNamespace,
      sourceLabel: "rag",
      markitdownAdapter: options.markitdownAdapter,
    });

    await indexChunks({
      store,
      chunks,
      ragNamespace,
      ragUserId,
      embedder,
      dimension,
    });

    return chunks.length;
  };

  const search = async (
    query: string,
    topK = 8,
    scoreThreshold?: number,
  ): Promise<VectorSearchHit[]> => {
    return searchVectors({
      store,
      query,
      options: {
        topK,
        ragNamespace,
        scoreThreshold,
      },
      embedder,
      dimension,
    });
  };

  const searchAdvanced = async (
    query: string,
    topK = 8,
    enableMqe = false,
    enableHyde = false,
    scoreThreshold?: number,
  ): Promise<VectorSearchHit[]> => {
    return searchVectorsExpanded({
      store,
      query,
      options: {
        topK,
        ragNamespace,
        enableMqe,
        enableHyde,
        scoreThreshold,
      },
      embedder,
      dimension,
    });
  };

  const getStats = async (): Promise<Record<string, unknown>> => ({});

  return {
    store,
    namespace: ragNamespace,
    addDocuments,
    search,
    searchAdvanced,
    getStats,
  };
}

function normalize1DVector(
  raw: number[] | number[][],
  dimension: number,
): number[] {
  const vector = Array.isArray(raw[0])
    ? (raw as number[][])[0]
    : (raw as number[]);
  const out = vector.map((n) => Number(n));
  if (out.length < dimension) {
    out.push(...new Array(dimension - out.length).fill(0));
  }
  if (out.length > dimension) {
    out.length = dimension;
  }
  return out;
}

function normalize2DVectors(
  raw: number[] | number[][],
  dimension: number,
  expectedCount: number,
): number[][] {
  const vectors = Array.isArray(raw[0])
    ? (raw as number[][])
    : [raw as number[]];
  const normalized = vectors.map((v) => normalize1DVector(v, dimension));

  while (normalized.length < expectedCount) {
    normalized.push(new Array(dimension).fill(0));
  }

  return normalized.slice(0, expectedCount);
}

function md5(input: string): string {
  return crypto.createHash("md5").update(input).digest("hex");
}

function toMetadata(value: unknown): RagChunkMetadata {
  if (!value || typeof value !== "object") {
    return {};
  }
  return value as RagChunkMetadata;
}
