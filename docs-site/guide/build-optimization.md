# Build Optimization

This document records the complete bundle optimization process applied to all AgenticFORGE packages.

## Summary of changes

| Optimization | Packages | Impact |
|---|---|---|
| Terser compression | All 8 packages | ~20-30% JS size reduction |
| Remove JS sourcemaps | All 8 packages | Saved ~420 KB across all packages |
| Explicit treeshake config | All 8 packages | More aggressive dead code elimination |
| Multi-entry split | `@agenticforge/memory` | 6 sub-paths, up to 75% smaller per-import |
| Fix circular dependency | `@agenticforge/memory` | Clean build, no warnings |
| Fix transitive externals | `@agenticforge/tools-builtin` | Correct bundle boundaries |

## `@agenticforge/memory` sub-path imports

Before v1.1.0, the entire memory package was one bundle. Now it ships 6 independent entry points:

```ts
// Before: always downloaded everything (~100 KB)
import {MemoryManager} from "@agenticforge/memory";

// After: only 7.6 KB — no qdrant/neo4j/openai
import {MemoryManager} from "@agenticforge/memory/manager";

// RAG only
import {createRagPipeline} from "@agenticforge/memory/rag";

// Storage adapters only
import {QdrantVectorStore} from "@agenticforge/memory/storage";

// Embedding factory only (0.6 KB)
import {createDefaultTextEmbedder} from "@agenticforge/memory/embedding";
```

## Bundle size results

| Package | JS size | JS sourcemap |
|---------|---------|-------------|
| `@agenticforge/utils` | 1.8 KB | 0 KB |
| `@agenticforge/kit` | 2 KB | 0 KB |
| `@agenticforge/context` | 4.9 KB | 0 KB |
| `@agenticforge/tools` | 8.5 KB | 0 KB |
| `@agenticforge/agents` | 28.6 KB | 0 KB |
| `@agenticforge/core` | 35.5 KB | 0 KB |
| `@agenticforge/memory` | 103.5 KB (6 entries) | 0 KB |
| `@agenticforge/tools-builtin` | 89.9 KB | 0 KB |

## Rollup config template

All packages now follow this standard configuration:

```js
import {defineConfig} from "rollup";
import nodeResolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import esbuild from "rollup-plugin-esbuild";
import terser from "@rollup/plugin-terser";

export default defineConfig({
  input: "src/index.ts",
  external: [/* runtime deps */],
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
