/**
 * Token counter utility.
 * Supports a simple character-based approximation or tiktoken-style encoding.
 */
export interface TokenCounterOptions {
  encodingName?: string;
  charsPerToken?: number;
}

export interface TokenCounter {
  count(text: string): number;
}

class ApproxTokenCounter implements TokenCounter {
  private readonly charsPerToken: number;
  constructor(charsPerToken: number) {
    this.charsPerToken = charsPerToken;
  }
  count(text: string): number {
    return Math.ceil(text.length / this.charsPerToken);
  }
}

/**
 * Create a TokenCounter.
 * When tiktoken is available and encodingName is provided, uses tiktoken.
 * Otherwise falls back to a character-ratio approximation.
 */
export function createTokenCounter(options: TokenCounterOptions = {}): TokenCounter {
  const charsPerToken = options.charsPerToken ?? 4;

  if (options.encodingName) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const tiktoken = require("tiktoken") as {
        get_encoding: (name: string) => { encode: (t: string) => Uint32Array };
      };
      const enc = tiktoken.get_encoding(options.encodingName);
      return {
        count(text: string): number {
          return enc.encode(text).length;
        },
      };
    } catch {
      // tiktoken not available — fall through to approx
    }
  }

  return new ApproxTokenCounter(charsPerToken);
}

export function estimateTokens(text: string, counter?: TokenCounter): number {
  return counter ? counter.count(text) : Math.ceil(text.length / 4);
}
