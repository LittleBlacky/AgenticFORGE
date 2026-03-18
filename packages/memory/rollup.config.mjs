import {defineConfig} from "rollup";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import nodeResolve from "@rollup/plugin-node-resolve";
import esbuild from "rollup-plugin-esbuild";
import terser from "@rollup/plugin-terser";

const external = [
  "@qdrant/js-client-rest",
  "neo4j-driver",
  "openai",
  "@agenticforge/core",
];

const plugins = [
  nodeResolve({preferBuiltins: true}),
  commonjs(),
  json(),
  esbuild({target: "es2022", minify: false}),
  terser({format: {comments: false}, compress: {passes: 2}}),
];

const treeshake = {
  moduleSideEffects: false,
  propertyReadSideEffects: false,
  tryCatchDeoptimization: false,
};

const input = {
  index:     "src/index.ts",
  manager:   "src/manager.ts",
  rag:       "src/rag/index.ts",
  storage:   "src/storage/index.ts",
  embedding: "src/embedding/index.ts",
  types:     "src/types/index.ts",
};

/**
 * Multi-entry build for @agenticforge/memory.
 *
 * Sub-paths:
 *   @agenticforge/memory          - full re-export (backward-compat)
 *   @agenticforge/memory/manager  - MemoryManager facade only
 *   @agenticforge/memory/rag      - RAG pipeline (heavy: openai)
 *   @agenticforge/memory/storage  - storage adapters (qdrant / neo4j / in-memory)
 *   @agenticforge/memory/embedding - embedding factory
 *   @agenticforge/memory/types    - pure TS types (no runtime cost)
 */
export default defineConfig([
  {
    input,
    external,
    treeshake,
    output: {
      dir: "dist/esm",
      format: "esm",
      sourcemap: false,
      chunkFileNames: "_chunks/[name]-[hash].js",
      entryFileNames: "[name].js",
    },
    plugins,
  },
  {
    input,
    external,
    treeshake,
    output: {
      dir: "dist/cjs",
      format: "cjs",
      sourcemap: false,
      interop: "auto",
      chunkFileNames: "_chunks/[name]-[hash].cjs",
      entryFileNames: "[name].cjs",
    },
    plugins,
  },
]);
