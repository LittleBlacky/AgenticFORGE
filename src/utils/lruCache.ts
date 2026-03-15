export interface LruCacheStats {
  hits: number;
  misses: number;
  getRequests: number;
  hitRate: number;
}

export class LruCache<K, V> {
  private readonly limit: number;
  private readonly map = new Map<K, V>();
  private hits = 0;
  private misses = 0;

  constructor(limit: number) {
    this.limit = Math.max(1, limit);
  }

  get(key: K): V | undefined {
    if (!this.map.has(key)) {
      this.misses += 1;
      return undefined;
    }
    this.hits += 1;
    const value = this.map.get(key) as V;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.limit) {
      const oldest = this.map.keys().next().value as K | undefined;
      if (oldest !== undefined) this.map.delete(oldest);
    }
  }

  size(): number {
    return this.limit;
  }

  getStats(): LruCacheStats {
    const getRequests = this.hits + this.misses;
    const hitRate = getRequests === 0 ? 0 : this.hits / getRequests;
    return {
      hits: this.hits,
      misses: this.misses,
      getRequests,
      hitRate,
    };
  }

  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
  }
}
