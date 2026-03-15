export class LruCache<K, V> {
  private readonly limit: number;
  private readonly map = new Map<K, V>();

  constructor(limit: number) {
    this.limit = Math.max(1, limit);
  }

  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined;
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
}
