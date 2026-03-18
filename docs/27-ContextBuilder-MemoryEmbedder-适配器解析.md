# ContextBuilder MemoryEmbedder 适配器解析

## 1. 背景与目标

- **背景**：`@agenticforge/memory` 已提供 `HashTextEmbedder`（零延迟哈希向量）和 `OpenAITextEmbedder`（OpenAI 兼容 API），但其 `encode()` 接口签名与 `ContextBuilder` 的 `TextEmbedder` 函数类型不一致，无法直接传入。
- **目标**：在 `@agenticforge/context` 内实现零侵入适配器，让用户一行代码接入 memory embedder，无需手动处理类型转换。

---

## 2. 接口差异分析

### @agenticforge/memory 的 TextEmbedder 接口

```ts
// packages/memory/src/embedding/embedders.ts
export interface TextEmbedder {
  encode(text: string | string[]): Promise<number[] | number[][]>;
}
```

- 方法式接口（实例方法 `encode`）
- 接受单个字符串或字符串数组
- 返回 `number[]`（单文本）或 `number[][]`（多文本）

### @agenticforge/context 的 TextEmbedder 类型

```ts
// packages/context/src/ContextBuilder.ts
export type TextEmbedder = (texts: string[]) => Promise<number[][]>;
```

- 函数类型（直接调用）
- 只接受字符串数组
- 只返回 `number[][]`

---

## 3. 适配器实现

### MemoryEmbedderLike 接口

```ts
export interface MemoryEmbedderLike {
  encode(text: string | string[]): Promise<number[] | number[][]>;
}
```

描述 memory embedder 的形状，不直接依赖 `@agenticforge/memory` 包，避免循环依赖。

### fromMemoryEmbedder() 适配器

```ts
export function fromMemoryEmbedder(embedder: MemoryEmbedderLike): TextEmbedder {
  return async (texts: string[]): Promise<number[][]> => {
    const result = await embedder.encode(texts);
    if (result.length === 0) return [];
    if (typeof result[0] === "number") {
      // 单向量情况（不应发生于批量输入，但做防御处理）
      return [result as number[]];
    }
    return result as number[][];
  };
}
```

**关键处理**：`encode(string[])` 理论上应返回 `number[][]`，但类型声明是联合类型。适配器检查第一个元素的类型，对 flat 数组做包裹处理，确保类型安全。

### ContextBuilderConfig.memoryEmbedder

```ts
export interface ContextBuilderConfig {
  // ...
  embedder?: TextEmbedder;        // 显式函数类型
  memoryEmbedder?: MemoryEmbedderLike; // memory embedder 便捷字段
}
```

构造函数中自动适配，优先级：`embedder` > `memoryEmbedder`：

```ts
embedder: cfg.embedder ?? (
  cfg.memoryEmbedder ? fromMemoryEmbedder(cfg.memoryEmbedder) : undefined
),
```

---

## 4. 关键流程

```
ContextBuilder 构造
  ├─ cfg.embedder 存在 → 直接使用
  └─ cfg.memoryEmbedder 存在 → fromMemoryEmbedder() → TextEmbedder
       └─ selectMmr() 调用时：
            embedder([query, p1, p2, ...])
              → encode([query, p1, p2, ...])
              → number[][]
              → 适配器标准化返回
```

---

## 5. 使用示例

### 场景 A：零配置（HashTextEmbedder 自动降级）

```ts
import {createDefaultTextEmbedder} from '@agenticforge/memory';
import {ContextBuilder} from '@agenticforge/context';

// .env 未配置 EMBEDDING_* → 自动使用 HashTextEmbedder
const builder = new ContextBuilder({
  config: {
    enableMmr: true,
    memoryEmbedder: createDefaultTextEmbedder(),
  },
});
```

**HashTextEmbedder 的向量质量**：基于 djb2 哈希，每个词映射到 384 维向量的一个位置，归一化后余弦相似度仍优于纯词袋 TF-IDF，且零延迟、零 API 调用。

### 场景 B：OpenAI embedding（语义最优）

```ts
import {OpenAITextEmbedder} from '@agenticforge/memory';
import {ContextBuilder} from '@agenticforge/context';

const builder = new ContextBuilder({
  config: {
    enableMmr: true,
    memoryEmbedder: new OpenAITextEmbedder({
      model: 'text-embedding-3-small',
      // apiKey / baseURL 从 EMBEDDING_API_KEY / EMBEDDING_BASE_URL 读取
    }),
    recencyWeight: 0.2,
  },
});
```

### 场景 C：自定义函数（最灵活）

```ts
const builder = new ContextBuilder({
  config: {
    enableMmr: true,
    embedder: async (texts) => {
      // 接入 BGE、Ollama、本地模型等任意服务
      return myEmbeddingService.batchEmbed(texts);
    },
  },
});
```

---

## 6. 可靠性与降级策略

| 场景 | 处理方式 |
|------|----------|
| `memoryEmbedder.encode()` 抛出异常 | selectMmr 内 try/catch，自动切换 TF-IDF |
| `embedder` 和 `memoryEmbedder` 都未配置 | 直接使用 TF-IDF，零感知 |
| `encode()` 返回 flat `number[]` | 适配器包裹为 `[number[]]`，防御处理 |
| HashTextEmbedder 维度不匹配 | denseCosine 取 `Math.min(a.length, b.length)`，安全截断 |

---

## 7. 局限与演进建议

- **无向量缓存**：每次 `build()` 调用都会重新 encode 所有 packet；高频场景可在 `ContextBuilder` 实例级别引入 LRU 缓存（以 `content` 为 key）。
- **无包间强类型绑定**：`MemoryEmbedderLike` 是结构化兼容接口，不是从 memory 包直接 import 的类型，升级 memory 包时需人工确认接口仍兼容。
- **批量大小无限制**：大量 packet 时 `encode(texts)` 单次调用可能超出 API 的 batch 限制；可分批调用并合并结果。
