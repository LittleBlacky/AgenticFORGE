# LruCache 使用说明

## 1. 背景与目标
- **背景**：在 MMR 向量相似度计算中，需要缓存向量以减少重复 embed 的开销。
- **目标**：提供一个轻量、可复用的 LRU 缓存工具，适用于 SDK 内多处缓存场景。

## 2. 设计要点
- **LRU 策略**：
  - 每次 `get` 命中都会提升为“最近使用”。
  - 超过容量时淘汰最久未使用的 key。
- **轻量实现**：基于 `Map` 的插入顺序特性，实现 O(1) 级别的操作。

## 3. API 说明
### 3.1 构造与容量
```ts
import {LruCache} from "./utils/lruCache";

const cache = new LruCache<string, number[]>(256);
```

### 3.2 读取
```ts
const value = cache.get("key");
```
- 命中后会将该 key 置为最近使用。

### 3.3 写入
```ts
cache.set("key", [0.1, 0.2, 0.3]);
```
- 如果容量超限，会移除最旧的 key。

### 3.4 容量查询
```ts
const capacity = cache.size();
```
- 返回 LRU 的容量上限，不是当前元素数量。

## 4. 典型用法
### 4.1 用于向量缓存
```ts
const vectorCache = new LruCache<string, number[]>(256);
vectorCache.set(content, vector);
```

## 5. 注意事项
- `size()` 返回的是容量上限而非当前缓存数量。
- 若需命中率统计或缓存清理，可在此基础上扩展。
