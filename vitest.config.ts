import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  esbuild: {
    // Bypass per-package tsconfig resolution (avoids Windows long-path issues)
    target: "es2022",
    tsconfigRaw: {
      compilerOptions: {
        experimentalDecorators: true,
        emitDecoratorMetadata: false,
        strict: true,
        esModuleInterop: true,
        module: "ESNext",
        moduleResolution: "Bundler",
      },
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.spec.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      all: false,
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
  resolve: {
    alias: {
      "@agenticforge/core": resolve("packages/core/src/index.ts"),
      "@agenticforge/tools": resolve("packages/tools/src/index.ts"),
      "@agenticforge/context": resolve("packages/context/src/index.ts"),
      "@agenticforge/memory": resolve("packages/memory/src/index.ts"),
      "@agenticforge/agents": resolve("packages/agents/src/index.ts"),
      "@agenticforge/workflow": resolve("packages/workflow/src/index.ts"),
      "@agenticforge/skills": resolve("packages/skills/src/index.ts"),
      "@agenticforge/utils": resolve("packages/utils/src/index.ts"),
      "@agenticforge/tools-builtin": resolve("packages/tools-builtin/src/index.ts"),
      "@agenticforge/kit": resolve("packages/kit/src/index.ts"),
    },
  },
});
