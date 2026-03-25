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
  esbuild({target: "es2022", minify: false}),
  terser({format: {comments: false}, compress: {passes: 2}}),
];

const treeshake = {
  moduleSideEffects: false,
  propertyReadSideEffects: false,
  tryCatchDeoptimization: false,
};

export default defineConfig({
  input: "src/index.ts",
  external: [
    "@agenticforge/core",
    "@agenticforge/context",
    "@agenticforge/tools",
    "@agenticforge/tools-builtin",
    "@agenticforge/memory",
    "@agenticforge/skills",
    "@agenticforge/workflow",
    "reflect-metadata",
    "zod",
  ],
  treeshake,
  output: [
    {file: "dist/esm/index.js", format: "esm", sourcemap: false, exports: "named"},
    {file: "dist/cjs/index.cjs", format: "cjs", sourcemap: false, exports: "named", interop: "auto"},
  ],
  plugins,
});
