# 打包优化

本文档记录了对所有 AgenticFORGE 包进行打包优化的完整过程。

## 优化汇总

| 优化项 | 涉及包 | 效果 |
|--------|--------|------|
| Terser 压缩 | 全部 8 个包 | JS 体积减少约 20-30% |
| 关闭 JS sourcemap | 全部 8 个包 | 节省约 420 KB |
| 显式 treeshake 配置 | 全部 8 个包 | 更激进的死代码消除 |
| 多入口拆分 | `@agenticforge/memory` | 6 个子路径，单次导入最多节省 75% |
| 修复循环依赖 | `@agenticforge/memory` | 构建干净无警告 |
| 修复传递依赖 external | `@agenticforge/tools-builtin` | 正确的 bundle 边界 |

## `@agenticforge/memory` 子路径导入

```ts
// v1.1.0 之前：始终下载全部内容（~100 KB）
import {MemoryManager} from "@agenticforge/memory";

// 之后：仅 7.6 KB — 不含 qdrant/neo4j/openai
import {MemoryManager} from "@agenticforge/memory/manager";

import {createRagPipeline} from "@agenticforge/memory/rag";
import {QdrantVectorStore} from "@agenticforge/memory/storage";
import {createDefaultTextEmbedder} from "@agenticforge/memory/embedding";
```

## 各包产物体积

| 包 | JS 体积 | sourcemap |
|----|---------|----------|
| `@agenticforge/utils` | 1.8 KB | 0 KB |
| `@agenticforge/kit` | 2 KB | 0 KB |
| `@agenticforge/context` | 4.9 KB | 0 KB |
| `@agenticforge/tools` | 8.5 KB | 0 KB |
| `@agenticforge/agents` | 28.6 KB | 0 KB |
| `@agenticforge/core` | 35.5 KB | 0 KB |
| `@agenticforge/memory` | 103.5 KB（6 个入口）| 0 KB |
| `@agenticforge/tools-builtin` | 89.9 KB | 0 KB |

## 统一配置模板

```js
import {defineConfig} from "rollup";
import nodeResolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import esbuild from "rollup-plugin-esbuild";
import terser from "@rollup/plugin-terser";

export default defineConfig({
  input: "src/index.ts",
  external: [/* runtime 依赖 */],
  treeshake: {
    moduleSideEffects: false,
    propertyReadSideEffects: false,
    tryCatchDeoptimization: false,
  },
  output: [
    {file: "dist/esm/index.js", format: "esm", sourcemap: false},
    {file: "dist/cjs/index.cjs", format: "cjs", sourcemap: false, interop: "auto"},
  ],
  plugins: [
    nodeResolve({preferBuiltins: true}),
    commonjs(),
    json(),
    esbuild({target: "es2022", minify: false}),
    terser({format: {comments: false}, compress: {passes: 2}}),
  ],
});
```
