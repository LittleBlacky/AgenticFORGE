/**
 * @agenticforge/utils — 单元测试
 * 覆盖：LruCache
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { LruCache } from "../../packages/utils/src/lruCache";

describe("LruCache", () => {
  let cache: LruCache<string>;

  beforeEach(() => {
    cache = new LruCache<string>(3);
  });

  it("set / get roundtrip", () => {
    cache.set("a", "1");
    expect(cache.get("a")).toBe("1");
  });

  it("has() returns true for existing key", () => {
    cache.set("a", "1");
    expect(cache.has("a")).toBe(true);
  });

  it("has() returns false for missing key", () => {
    expect(cache.has("nope")).toBe(false);
  });

  it("get() returns undefined for missing key", () => {
    expect(cache.get("nope")).toBeUndefined();
  });

  it("size reflects number of entries", () => {
    cache.set("a", "1");
    cache.set("b", "2");
    expect(cache.size).toBe(2);
  });

  it("evicts oldest entry when over maxSize", () => {
    cache.set("a", "1");
    cache.set("b", "2");
    cache.set("c", "3");
    cache.set("d", "4"); // should evict "a"
    expect(cache.has("a")).toBe(false);
    expect(cache.size).toBe(3);
  });

  it("get() promotes entry (LRU order)", () => {
    cache.set("a", "1");
    cache.set("b", "2");
    cache.set("c", "3");
    cache.get("a"); // promote "a" to most recent
    cache.set("d", "4"); // should evict "b" (now oldest)
    expect(cache.has("a")).toBe(true);
    expect(cache.has("b")).toBe(false);
  });

  it("set() with existing key updates value and promotes", () => {
    cache.set("a", "1");
    cache.set("b", "2");
    cache.set("a", "updated"); // re-insert "a"
    cache.set("c", "3");
    cache.set("d", "4"); // evicts "b" (oldest)
    expect(cache.get("a")).toBe("updated");
    expect(cache.has("b")).toBe(false);
  });

  it("delete() removes entry and returns true", () => {
    cache.set("a", "1");
    expect(cache.delete("a")).toBe(true);
    expect(cache.has("a")).toBe(false);
  });

  it("delete() returns false for missing key", () => {
    expect(cache.delete("nope")).toBe(false);
  });

  it("clear() empties the cache", () => {
    cache.set("a", "1");
    cache.set("b", "2");
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.has("a")).toBe(false);
  });

  it("keys() returns all current keys", () => {
    cache.set("x", "1");
    cache.set("y", "2");
    expect(cache.keys()).toEqual(expect.arrayContaining(["x", "y"]));
  });

  it("values() returns all current values", () => {
    cache.set("x", "val1");
    cache.set("y", "val2");
    expect(cache.values()).toEqual(expect.arrayContaining(["val1", "val2"]));
  });

  it("entries() returns key-value pairs", () => {
    cache.set("a", "1");
    const entries = cache.entries();
    expect(entries.some(([k, v]) => k === "a" && v === "1")).toBe(true);
  });

  it("maxSize=1 keeps only the most recent entry", () => {
    const c = new LruCache<string>(1);
    c.set("a", "1");
    c.set("b", "2");
    expect(c.has("a")).toBe(false);
    expect(c.get("b")).toBe("2");
  });

  it("constructor clamps maxSize to minimum 1", () => {
    const c = new LruCache<string>(0);
    c.set("a", "1");
    expect(c.get("a")).toBe("1");
  });

  it("works with number values", () => {
    const nc = new LruCache<number>(5);
    nc.set("n", 42);
    expect(nc.get("n")).toBe(42);
  });

  it("works with object values", () => {
    const oc = new LruCache<object>(5);
    const obj = { x: 1 };
    oc.set("o", obj);
    expect(oc.get("o")).toBe(obj);
  });
});
