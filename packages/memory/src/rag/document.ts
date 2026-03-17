import crypto from "node:crypto";
import fs from "node:fs";

export interface DocumentMetadata {
  [key: string]: unknown;
}

export interface DocumentInit {
  content: string;
  metadata: DocumentMetadata;
  docId?: string;
}

export class Document {
  content: string;
  metadata: DocumentMetadata;
  docId: string;

  constructor(init: DocumentInit) {
    this.content = init.content;
    this.metadata = init.metadata;
    this.docId = init.docId ?? md5(init.content);
  }
}

export interface DocumentChunkInit {
  content: string;
  metadata: DocumentMetadata;
  chunkId?: string;
  docId?: string;
  chunkIndex?: number;
}

export class DocumentChunk {
  content: string;
  metadata: DocumentMetadata;
  chunkId: string;
  docId?: string;
  chunkIndex: number;

  constructor(init: DocumentChunkInit) {
    this.content = init.content;
    this.metadata = init.metadata;
    this.docId = init.docId;
    this.chunkIndex = init.chunkIndex ?? 0;

    const chunkContent = `${this.docId ?? "unknown"}_${this.chunkIndex}_${this.content.slice(0, 50)}`;
    this.chunkId = init.chunkId ?? md5(chunkContent);
  }
}

export interface DocumentProcessorOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  separators?: string[];
}

export class DocumentProcessor {
  readonly chunkSize: number;
  readonly chunkOverlap: number;
  readonly separators: string[];

  constructor(options: DocumentProcessorOptions = {}) {
    this.chunkSize = options.chunkSize ?? 1000;
    this.chunkOverlap = options.chunkOverlap ?? 200;
    this.separators = options.separators ?? ["\n\n", "\n", "。", ".", " "];
  }

  processDocument(document: Document): DocumentChunk[] {
    const chunks = this.splitText(document.content);

    return chunks.map((chunkContent, index) => {
      const chunkMetadata: DocumentMetadata = {
        ...document.metadata,
        doc_id: document.docId,
        chunk_index: index,
        total_chunks: chunks.length,
        processed_at: new Date().toISOString(),
      };

      return new DocumentChunk({
        content: chunkContent,
        metadata: chunkMetadata,
        docId: document.docId,
        chunkIndex: index,
      });
    });
  }

  processDocuments(documents: Document[]): DocumentChunk[] {
    const allChunks: DocumentChunk[] = [];

    for (const document of documents) {
      allChunks.push(...this.processDocument(document));
    }

    return allChunks;
  }

  mergeChunks(chunks: DocumentChunk[], maxLength = 2000): DocumentChunk[] {
    if (chunks.length === 0) {
      return [];
    }

    const mergedChunks: DocumentChunk[] = [];
    let currentChunk = new DocumentChunk({
      content: chunks[0].content,
      metadata: {...chunks[0].metadata},
      chunkId: chunks[0].chunkId,
      docId: chunks[0].docId,
      chunkIndex: chunks[0].chunkIndex,
    });

    for (const nextChunk of chunks.slice(1)) {
      const combinedLength = currentChunk.content.length + nextChunk.content.length;

      if (combinedLength <= maxLength && currentChunk.docId === nextChunk.docId) {
        currentChunk.content += `\n${nextChunk.content}`;

        const currentTotalChunks = Number(currentChunk.metadata.total_chunks ?? 1);
        currentChunk.metadata.total_chunks = currentTotalChunks + 1;
      } else {
        mergedChunks.push(currentChunk);
        currentChunk = new DocumentChunk({
          content: nextChunk.content,
          metadata: {...nextChunk.metadata},
          chunkId: nextChunk.chunkId,
          docId: nextChunk.docId,
          chunkIndex: nextChunk.chunkIndex,
        });
      }
    }

    mergedChunks.push(currentChunk);
    return mergedChunks;
  }

  filterChunks(chunks: DocumentChunk[], minLength = 50): DocumentChunk[] {
    return chunks.filter((chunk) => chunk.content.trim().length >= minLength);
  }

  addChunkMetadata(chunks: DocumentChunk[], metadata: DocumentMetadata): DocumentChunk[] {
    for (const chunk of chunks) {
      chunk.metadata = {
        ...chunk.metadata,
        ...metadata,
      };
    }

    return chunks;
  }

  private splitText(text: string): string[] {
    if (text.length <= this.chunkSize) {
      return [text];
    }

    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      const end = start + this.chunkSize;

      if (end >= text.length) {
        chunks.push(text.slice(start));
        break;
      }

      let splitPoint = this.findSplitPoint(text, start, end);
      if (splitPoint === -1) {
        splitPoint = end;
      }

      chunks.push(text.slice(start, splitPoint));
      start = Math.max(start + 1, splitPoint - this.chunkOverlap);
    }

    return chunks;
  }

  private findSplitPoint(text: string, start: number, end: number): number {
    for (const separator of this.separators) {
      const searchStart = Math.max(start, end - 100);

      for (let i = end - separator.length; i >= searchStart; i -= 1) {
        if (text.slice(i, i + separator.length) === separator) {
          return i + separator.length;
        }
      }
    }

    return -1;
  }
}

export interface LoadTextFileOptions {
  encoding?: BufferEncoding;
}

export function loadTextFile(filePath: string, options: LoadTextFileOptions = {}): Document {
  const encoding = options.encoding ?? "utf-8";
  const content = fs.readFileSync(filePath, {encoding});

  return new Document({
    content,
    metadata: {
      source: filePath,
      type: "text_file",
      loaded_at: new Date().toISOString(),
    },
  });
}

export function createDocument(content: string, metadata: DocumentMetadata = {}): Document {
  return new Document({content, metadata});
}

function md5(content: string): string {
  return crypto.createHash("md5").update(content).digest("hex");
}
