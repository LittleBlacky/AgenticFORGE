# 更新日志

## v1.1.1 — 2026-03-18

### 新增
- 为全部 8 个包及根目录新增英文 README（`README.en.md`）
- VitePress 中英文双语文档站（`docs-site/`）

### 修复
- 移除所有 `package.json` 的 BOM 标记（在 Windows 上导致 rollup JSON 解析错误）

---

## v1.1.0 — 2026-03-18

### 新增
- `@agenticforge/memory`：6 个子路径导出，支持 Tree-shaking
  - `/manager`、`/rag`、`/storage`、`/embedding`、`/types`
- `src/embedding/embedders.ts`：提取嵌入器类，消除循环依赖

### 变更
- 全部 8 个包：启用 **Terser** 压缩（两轮）
- 全部 8 个包：关闭生产环境 **JS sourcemap**
- 全部 8 个包：显式 **treeshake** 配置
- `@agenticforge/tools-builtin`：补全传递依赖 external（`graceful-fs`、`retry`、`signal-exit`）

### 修复
- `@agenticforge/memory` 循环依赖（embedding ↔ rag）
- 所有包构建警告清零

---

## v1.0.2 — 初始发布

- 全部 8 个包首次发布
