# Changelog

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
