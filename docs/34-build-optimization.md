# AgenticFORGE 打包优化解析文档

> 本文档记录了对 `packages/` 下所有子包进行打包优化的完整过程、技术原理及最终结果。

---

## 一、优化前的问题

### 1.1 单入口大文件打包

优化前，所有子包（包括 `@agenticforge/memory`）均采用单一入口打包策略：

```js
// 优化前：每个包的 rollup.config.mjs
export default defineConfig({
  input: "src/index.ts",          // 单一入口
  output: [
    {file: "dist/esm/index.js", format: "esm", sourcemap: true},
    {file: "dist/cjs/index.cjs", format: "cjs", sourcemap: true},
  ],
  plugins: [nodeResolve(), commonjs(), json(), esbuild()],
});
```

**问题：**
- 用户引入任意一个功能（如仅用 `MemoryManager`），也会下载整个包的全部代码（包含 qdrant、neo4j、openai embedding 等重量级模块）
- 所有子包均**无压缩**（未启用 terser）
- 所有包均生成 **JS sourcemap**，sourcemap 体积约占总产物的 60%+
- 无显式 treeshake 配置，死代码消除效果差

### 1.2 循环依赖

`@agenticforge/memory` 内部存在循环依赖链：

```
src/embedding/index.ts
   src/embedding/factory.ts
     src/rag/pipeline.ts          (import createDefaultTextEmbedder from "../embedding")
       src/embedding/index.ts     循环！
```

原因：`pipeline.ts` 内嵌了 `HashTextEmbedder` / `OpenAITextEmbedder` 的实现，同时又通过 `../embedding` 导入这些类（通过 `factory.ts` 间接引用），导致 rollup 报循环依赖警告，影响 tree-shaking 效果。

### 1.3 `tools-builtin` 的 external 遗漏

`proper-lockfile` 被列为 external，但其传递依赖（`graceful-fs`、`retry`、`signal-exit`）未被排除，导致这些依赖被打包进 bundle。

---

## 二、优化方案

### 2.1 `@agenticforge/memory`：多入口拆分

`memory` 是整个 SDK 中体积最大、依赖最重的包。用户的使用场景高度分散：

| 场景 | 需要的模块 | 不需要的模块 |
|---|---|---|
| 仅用内存管理 | `manager` | qdrant、neo4j、openai embedding |
| 仅用 RAG | `rag` | neo4j、in-memory store |
| 仅用存储适配器 | `storage` | RAG pipeline、embedding |
| 仅用嵌入工厂 | `embedding` | 存储、RAG |

**方案**：将 `input` 从单字符串改为对象，定义 6 个独立入口：

```js
// packages/memory/rollup.config.mjs（优化后）
const input = {
  index:     "src/index.ts",       // 全量，向后兼容
  manager:   "src/manager.ts",     // MemoryManager 门面
  rag:       "src/rag/index.ts",   // RAG pipeline（重量：含 openai）
  storage:   "src/storage/index.ts", // 存储适配器（qdrant/neo4j/内存）
  embedding: "src/embedding/index.ts", // 嵌入工厂
  types:     "src/types/index.ts", // 纯类型定义
};

export default defineConfig([
  {
    input,
    output: {
      dir: "dist/esm",
      format: "esm",
      sourcemap: false,
      chunkFileNames: "_chunks/[name]-[hash].js",  // 共享模块自动提取
      entryFileNames: "[name].js",
    },
    // ...
  },
  // CJS 同结构...
]);
```

**关键机制**：rollup 的**代码分割（Code Splitting）**会自动将多个入口之间共享的模块提取为 `_chunks/` 下的公共 chunk，避免重复打包。

例如 `MemoryManager`（`manager` 入口）依赖了 `storage/types`，而 `storage` 入口也依赖它，rollup 会将 `storage/types` 提取为一个共享 chunk，两个入口共用，不重复打包。

**`package.json` 同步更新 `exports` 字段**，支持按需导入：

```json
{
  "exports": {
    ".": {
      "types": "./dist/types/index.d.ts",
      "import": "./dist/esm/index.js",
      "require": "./dist/cjs/index.cjs"
    },
    "./manager": {
      "types": "./dist/types/manager.d.ts",
      "import": "./dist/esm/manager.js",
      "require": "./dist/cjs/manager.cjs"
    },
    "./rag": { ... },
    "./storage": { ... },
    "./embedding": { ... },
    "./types": { ... }
  }
}
```

用户现在可以精确按需导入：

```ts
// 只下载 manager.js（7.6 KB），不含 qdrant/neo4j/openai
import { MemoryManager } from "@agenticforge/memory/manager";

// 只下载 rag.js（30 KB），不含存储适配器
import { createRagPipeline } from "@agenticforge/memory/rag";

// 只下载 storage.js（7.6 KB）
import { QdrantVectorStore } from "@agenticforge/memory/storage";
```

---

### 2.2 修复循环依赖

**根本原因**：`HashTextEmbedder` 和 `OpenAITextEmbedder` 这两个类定义在 `rag/pipeline.ts` 中，但 `embedding/factory.ts` 需要用它们来创建默认嵌入器，而 `pipeline.ts` 又通过 `../embedding` 导入 `createDefaultTextEmbedder`，形成环路。

**解决方案**：新建 `src/embedding/embedders.ts`，将两个嵌入器类从 `pipeline.ts` 中提取出来：

```
优化前的依赖图（有循环）：
  embedding/index.ts
     embedding/factory.ts
       rag/pipeline.ts       (内嵌 HashTextEmbedder、OpenAITextEmbedder)
         embedding/index.ts   循环！

优化后的依赖图（无循环）：
  embedding/embedders.ts      (HashTextEmbedder、OpenAITextEmbedder 定义在此)
                        
  embedding/factory.ts   rag/pipeline.ts
        
  embedding/index.ts
```

**文件变更**：

| 文件 | 变更 |
|---|---|
| `src/embedding/embedders.ts` | **新建**：放 `TextEmbedder` 接口、`HashTextEmbedder`、`OpenAITextEmbedder` |
| `src/embedding/factory.ts` | 改从 `./embedders` 导入，移除对 `../rag/pipeline` 的依赖 |
| `src/embedding/index.ts` | 同时导出 `embedders` 和 `factory` |
| `src/rag/pipeline.ts` | 改从 `../embedding/embedders` 导入类，从 `../embedding/factory` 导入工厂函数，移除内嵌的类定义 |

---

### 2.3 全包统一优化：terser 压缩 + 关闭 sourcemap + treeshake

对所有 8 个子包（`core`、`utils`、`tools`、`tools-builtin`、`agents`、`context`、`kit`、`memory`）统一应用以下三项优化：

#### 2.3.1 启用 terser 压缩

```js
import terser from "@rollup/plugin-terser";

terser({
  format: {comments: false},   // 删除所有注释
  compress: {passes: 2},       // 两轮压缩，效果更好
})
```

`@rollup/plugin-terser` 已在所有子包的 `devDependencies` 中，但优化前没有任何子包使用它。terser 在 esbuild 转译完成后运行，进一步压缩标识符名称、消除死代码、折叠常量。

> **注意**：`esbuild` 的 `minify` 和 `terser` 可以叠加使用，但此处保持 esbuild 只做 TypeScript 转译（`minify: false`），将压缩工作交给 terser，这样可以享受 terser 更强大的语义分析压缩能力。

#### 2.3.2 关闭 JS sourcemap

```js
output: {
  sourcemap: false,   // 优化前为 true
}
```

Sourcemap 在**生产发布的 npm 包**中意义有限（用户不需要调试你的 SDK 内部实现），但它会让每个 JS 文件对应生成一个等大的 `.map` 文件。

优化前，sourcemap 体积约占总 `dist` 产物的 **60%**：

```
优化前 dist/ 总计约 1.1 MB（以 memory 包为例 701.8 KB）
其中 sourcemap：~420 KB
其中 JS 代码：~280 KB
```

优化后 **JS sourcemap 全部清零**。

>  TypeScript 声明文件的 `.d.ts.map`（由 `tsc` 生成）不受此控制，它是 `tsconfig.build.json` 中 `declaration` 的产物。如需去除可在 `tsconfig.build.json` 中设置 `"declarationMap": false`，但会影响 IDE 的「跳转到定义」体验，建议保留。

#### 2.3.3 显式 treeshake 配置

```js
const treeshake = {
  moduleSideEffects: false,          // 假设所有模块无副作用（配合 package.json 的 "sideEffects": false）
  propertyReadSideEffects: false,    // 假设属性读取无副作用（消除更多死代码）
  tryCatchDeoptimization: false,     // 不因 try/catch 降级优化（激进模式）
};
```

这三个选项配合 `package.json` 中已有的 `"sideEffects": false` 声明，允许 rollup 更激进地消除未使用的导出。

---

### 2.4 修复 `tools-builtin` 的 external

`proper-lockfile` 本身是 external 的，但它的传递依赖在 rollup 默认行为下会被 bundle 进产物。

**修复**：显式列出所有传递依赖：

```js
external: [
  "proper-lockfile",
  "graceful-fs",     // proper-lockfile 的依赖
  "retry",           // proper-lockfile 的依赖
  "signal-exit",     //   "signal-exit",     // proper-lockfile 的依赖
  "@agenticforge/tools",
  "@agenticforge/memory",
  "@agenticforge/core",
  "zod",
  /^node:/,          // 排除所有 Node.js 内置模块
];
```

> **经验**：当一个第三方包的传递依赖未被 rollup 自动识别为 external 时，需要手动列出。使用 `node -e "require('./node_modules/pkg/package.json').dependencies"` 可快速查看一个包的直接依赖。

---

## 三、优化结果

### 3.1 JS sourcemap 全部清零

| 包 | 优化前 js.map | 优化后 js.map |
|---|---|---|
| 所有包 | ~420 KB（合计） | **0 KB** |

### 3.2 各包 JS 产物体积（优化后）

| 包 | JS 体积 | 说明 |
|---|---|---|
| `@agenticforge/utils` | **1.8 KB** | 纯工具函数，LRU Cache 等 |
| `@agenticforge/kit` | **2 KB** | 聚合 re-export 入口 |
| `@agenticforge/context` | **4.9 KB** | ContextBuilder + tokenizer |
| `@agenticforge/tools` | **8.5 KB** | Tool 基类 + ToolRegistry + ToolChain |
| `@agenticforge/agents` | **28.6 KB** | 5 种 Agent 实现 |
| `@agenticforge/core` | **35.5 KB** | LLM Client + openai 封装 |
| `@agenticforge/memory` | **103.5 KB** | 6 个入口，含 RAG pipeline |
| `@agenticforge/tools-builtin` | **89.9 KB** | 5 个完整工具类（terser 压缩后） |

### 3.3 `@agenticforge/memory` 多入口产物

| 入口 | ESM | CJS | 按需下载节省 |
|---|---|---|---|
| `index`（全量） | ~30 KB | ~31 KB | 基准 |
| `manager` | **7.6 KB** | **7.6 KB** | 节省 ~75%（无 qdrant/neo4j/openai） |
| `rag` | **30 KB** | **31 KB** | 独立 RAG 功能 |
| `storage` | **7.6 KB** | **7.9 KB** | 节省 ~75% |
| `embedding` | **0.6 KB** | **0.7 KB** | 极小，仅工厂函数 |
| `types` | **35 KB** | **35 KB** | 含运行时类型实现 |
| `_chunks/qdrant` | **8 KB** | **8.2 KB** | 共享 chunk，不重复打包 |
| `_chunks/embedders` | **2.5 KB** | **2.7 KB** | 共享 chunk，不重复打包 |

---

## 四、统一配置模板

所有子包现在遵循同一个配置模式：

```js
// packages/<name>/rollup.config.mjs
import {defineConfig} from "rollup";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import nodeResolve from "@rollup/plugin-node-resolve";
import esbuild from "rollup-plugin-esbuild";
import terser from "@rollup/plugin-terser";

const plugins = [
  nodeResolve({preferBuiltins: true}),
  commonjs(),
  json(),
  esbuild({target: "es2022", minify: false}),   // 转译，不压缩
  terser({format: {comments: false}, compress: {passes: 2}}),  // 压缩
];

const treeshake = {
  moduleSideEffects: false,
  propertyReadSideEffects: false,
  tryCatchDeoptimization: false,
};

export default defineConfig({
  input: "src/index.ts",
  external: [ /* 所有 runtime dependencies */ ],
  treeshake,
  output: [
    {file: "dist/esm/index.js",  format: "esm", sourcemap: false, exports: "named"},
    {file: "dist/cjs/index.cjs", format: "cjs", sourcemap: false, exports: "named", interop: "auto"},
  ],
  plugins,
});
```

---

## 五、新增文件清单

| 文件 | 类型 | 说明 |
|---|---|---|
| `packages/memory/src/embedding/embedders.ts` | 新建 | 提取 `HashTextEmbedder`、`OpenAITextEmbedder`、`TextEmbedder` 接口，消除循环依赖 |
| `docs/build-optimization.md` | 新建 | 本文档 |

## 六、修改文件清单

| 文件 | 修改内容 |
|---|---|
| `packages/memory/rollup.config.mjs` | 改为多入口 + terser + 关闭 sourcemap + treeshake |
| `packages/memory/package.json` | `exports` 增加 6 条子路径 |
| `packages/memory/src/embedding/factory.ts` | 改从 `./embedders` 导入，断开循环 |
| `packages/memory/src/embedding/index.ts` | 同时导出 `embedders` 和 `factory` |
| `packages/memory/src/rag/pipeline.ts` | 改从 `../embedding/embedders` 和 `../embedding/factory` 导入；修复原文件中多处 UTF-8 编码损坏的字符串字面量 |
| `packages/core/rollup.config.mjs` | terser + 关闭 sourcemap + treeshake |
| `packages/utils/rollup.config.mjs` | terser + 关闭 sourcemap + treeshake |
| `packages/tools/rollup.config.mjs` | terser + 关闭 sourcemap + treeshake |
| `packages/tools-builtin/rollup.config.mjs` | terser + 关闭 sourcemap + treeshake + 补全 external（`graceful-fs`、`retry`、`signal-exit`）|
| `packages/agents/rollup.config.mjs` | terser + 关闭 sourcemap + treeshake |
| `packages/context/rollup.config.mjs` | terser + 关闭 sourcemap + treeshake |
| `packages/kit/rollup.config.mjs` | terser + 关闭 sourcemap + treeshake |

---

## 七、进一步优化建议

以下优化项未在本次实施，列出供后续参考：

### 7.1 去除 `.d.ts.map`

`.d.ts.map` 是 TypeScript 源码到声明文件的映射，体积可观（`kit` 包 63 KB、`memory` 包 36 KB）。如不需要支持 IDE「跳转到 TypeScript 源码」功能，可在 `tsconfig.build.json` 中关闭：

```json
{
  "compilerOptions": {
    "declarationMap": false
  }
}
```

### 7.2 `types` 入口运行时体积

`@agenticforge/memory/types` 入口产物约 35 KB，原因是 `src/types/index.ts` 导出了 `WorkingMemory`、`EpisodicMemory`、`SemanticMemory`、`PerceptualMemory` 这些含完整实现的类，而非纯 TypeScript 类型。

若希望 `types` 入口真正轻量，可将其改为只导出 `type` 声明：

```ts
// src/types/index.ts（调整后）
export type {MemoryType, MemoryItem, MemoryConfig} from "./base";
export type {Episode} from "./episodic";
// ...只导出 type，不导出类实现
```

### 7.3 为 `tools-builtin` 拆分子入口

`tools-builtin` 目前 89.9 KB，包含 5 个工具类。用户若只需要 `SearchTool`，不应下载 `NoteTool`（含文件锁逻辑）和 `RagTool`（含 LLM 调用）。

类比 `memory` 包的多入口方案，可为 `tools-builtin` 增加子路径：

```
@agenticforge/tools-builtin/memory     MemoryTool
@agenticforge/tools-builtin/note       NoteTool
@agenticforge/tools-builtin/rag        RagTool
@agenticforge/tools-builtin/search     SearchTool
@agenticforge/tools-builtin/terminal   TerminalTool
```

### 7.4 `package.json` 的 `files` 字段排除 `.d.ts.map`

即使保留 `.d.ts.map` 用于本地开发，也可以在发布 npm 时通过 `files` 字段排除它：

```json
{
  "files": [
    "dist/**/*.js",
    "dist/**/*.cjs",
    "dist/**/*.d.ts",
    "!dist/**/*.map"
  ]
}
```

这样 npm 包体积会进一步减小，而本地开发时 `.d.ts.map` 仍然存在。