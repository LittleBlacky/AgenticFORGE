# Changelog

## v1.3.2 — 2026-03-20

### Added
- `@agenticforge/core` `LLMClient`: new `streamThinkChunked()` method — each chunk carries a type tag (`"thinking" | "content"`), natively supporting reasoning token streaming for DeepSeek R1, Claude, and other thinking models
- `@agenticforge/core` `LLMClient.streamThink()`: optional third parameter `streamMode` (`"content-only"` | `"thinking-only"` | `"all"`); defaults to `"content-only"` — fully backward-compatible
- `@agenticforge/core` `Agent` base class: default `streamRun()` implementation that calls `llm.streamThink()` and yields tokens one by one — all subclasses inherit true streaming without any extra code
- `@agenticforge/core`: new exported types `StreamChunk` and `StreamMode`

### Changed
- `@agenticforge/agents`: removed fake `streamRun()` (`yield await this.run()`) from `SimpleAgent`, `ReActAgent`, `PlanSolveAgent`, and `ReflectionAgent` — they now inherit the real streaming base implementation; `FunctionCallAgent` and `SkillAgent` retain their own overrides

### Tests
- `tests/unit/core.test.ts`: 9 new test cases covering `streamRun()` base behavior (chunk yielding, history recording, systemPrompt injection, temperature forwarding) and all `streamThinkChunked()` / `StreamMode` combinations

---

## v1.3.0 — 2026-03-20

### Added
- `@agenticforge/agents` `WorkflowAgent`: new **Branch** and **Loop** node types, completing support for all four execution modes
  - `type: "branch"` — conditional branching; `condition(ctx)` returns the branch name, engine executes the corresponding sub-DAG
  - `type: "loop"` — do-while loop; `body` sub-DAG runs until `condition` returns `false` or `maxIterations` is reached
- `NodeResult`: new fields `iterations` (actual loop count) and `branch` (executed branch name)
- New full example: `examples/workflowAgent.demo.ts`

### Changed
- `WorkflowNode` union type extended from 4 to 6 variants (`BranchNode`, `LoopNode`) — fully backward-compatible
- `WorkflowEngine` internal DAG executor refactored to recursive implementation supporting nested sub-DAGs
- Interpolation regex extended from `{\w+}` to `{[\w-]+}` to support hyphenated node IDs (e.g. `refine-loop`)

---

## v1.1.1 — 2026-03-18

### Added
- English README (`README.en.md`) for all 8 packages and root
- VitePress documentation site (`docs-site/`)

### Fixed
- Removed BOM from all `package.json` files (caused rollup JSON parse error on Windows)

---

## v1.1.0 — 2026-03-18

### Added
- `@agenticforge/memory`: 6 sub-path exports for tree-shaking
  - `/manager`, `/rag`, `/storage`, `/embedding`, `/types`
- `src/embedding/embedders.ts` — extracted `HashTextEmbedder` and `OpenAITextEmbedder` from `pipeline.ts` to break circular dependency

### Changed
- All 8 packages: enabled **terser** compression (`passes: 2`)
- All 8 packages: disabled **JS sourcemaps** in production builds
- All 8 packages: explicit **treeshake** config (`moduleSideEffects: false`)
- `@agenticforge/tools-builtin`: added `graceful-fs`, `retry`, `signal-exit` to externals

### Fixed
- Circular dependency in `@agenticforge/memory` (embedding ↔ rag)
- Build warnings eliminated across all packages

---

## v1.0.2 — initial release

- First published versions of all 8 packages
