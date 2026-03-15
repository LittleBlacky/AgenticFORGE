import {createRequire} from "node:module";

type TiktokenEncoding = {encode: (text: string) => number[]};

type TiktokenModule = {
  getEncoding: (name: string) => TiktokenEncoding;
};

export interface TokenizerOptions {
  encodingName?: string;
}

export class Tokenizer {
  private static readonly encodingCache = new Map<string, TiktokenEncoding | null>();
  private readonly encodingName: string;

  constructor(options: TokenizerOptions = {}) {
    this.encodingName = options.encodingName ?? "cl100k_base";
  }

  countTokens(text: string): number {
    if (!text) return 0;
    const encoding = this.getEncoding();
    if (!encoding) return roughCountTokens(text);
    return encoding.encode(text).length;
  }

  private getEncoding(): TiktokenEncoding | null {
    if (Tokenizer.encodingCache.has(this.encodingName)) {
      return Tokenizer.encodingCache.get(this.encodingName) ?? null;
    }

    const loaded = tryLoadEncoding(this.encodingName);
    Tokenizer.encodingCache.set(this.encodingName, loaded);
    return loaded;
  }
}

export function createTokenCounter(options?: TokenizerOptions): (text: string) => number {
  const tokenizer = new Tokenizer(options);
  return (text: string) => tokenizer.countTokens(text);
}

export function roughCountTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

function tryLoadEncoding(name: string): TiktokenEncoding | null {
  try {
    const require = createRequire(import.meta.url);
    const mod = require("js-tiktoken") as TiktokenModule;
    return mod.getEncoding(name);
  } catch (error) {
    console.warn("⚠️ js-tiktoken 未安装或加载失败，已回退到粗略 token 估算:", error);
    return null;
  }
}
