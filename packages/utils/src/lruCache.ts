export interface LruCacheEntry<T> {
  value: T;
  timestamp: number;
}

export class LruCache<T> {
  private readonly maxSize: number;
  private readonly cache = new Map<string, LruCacheEntry<T>>();

  constructor(maxSize = 100) {
    this.maxSize = Math.max(1, maxSize);
  }

  get size(): number {
    return this.cache.size;
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    this.cache.set(key, { value, timestamp: Date.now() });

    if (this.cache.size > this.maxSize) {
      const oldestKey = this.cache.keys().next().value as string | undefined;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  keys(): string[] {
    return [...this.cache.keys()];
  }

  values(): T[] {
    return [...this.cache.values()].map((entry) => entry.value);
  }

  entries(): Array<[string, T]> {
    return [...this.cache.entries()].map(([key, entry]) => [key, entry.value]);
  }
}
