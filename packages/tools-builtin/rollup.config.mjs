import {defineConfig} from "rollup";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import nodeResolve from "@rollup/plugin-node-resolve";
import esbuild from "rollup-plugin-esbuild";

export default defineConfig({
  input: "src/index.ts",
  output: [
    {file: "dist/esm/index.js", format: "esm", sourcemap: true},
    {file: "dist/cjs/index.cjs", format: "cjs", sourcemap: true},
  ],
  plugins: [nodeResolve({preferBuiltins: true}), commonjs(), json(), esbuild()],
  external: [
    "proper-lockfile",
    "@agenticforge/tools",
    "@agenticforge/memory",
    "@agenticforge/core",
    "zod",
  ],
});
