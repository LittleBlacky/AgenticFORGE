/**
 * Simple in-memory store used by ReflectionAgent to accumulate
 * critique/revision rounds.
 */
export interface ReflectionEntry {
  draft: string;
  critique: string;
  revision: string;
  round: number;
  timestamp: Date;
}

export class ReflectionMemory {
  private readonly entries: ReflectionEntry[] = [];

  add(entry: Omit<ReflectionEntry, "timestamp">): void {
    this.entries.push({ ...entry, timestamp: new Date() });
  }

  getAll(): ReflectionEntry[] {
    return [...this.entries];
  }

  getLast(): ReflectionEntry | undefined {
    return this.entries[this.entries.length - 1];
  }

  clear(): void {
    this.entries.length = 0;
  }

  size(): number {
    return this.entries.length;
  }
}
