# 更新日志

## v1.3.0 — 2026-03-20

### 新增
- `@agenticforge/agents` `WorkflowAgent`：新增 **Branch** 和 **Loop** 两种节点类型，完整支持四种执行模式
  - `type: "branch"` — 条件分支节点，`condition(ctx)` 返回分支名，引擎执行对应子 DAG
  - `type: "loop"` — 循环节点（do-while 语义），`body` 子 DAG 反复执行直到 `condition` 返回 `false` 或达到 `maxIterations`
- `NodeResult` 新增 `iterations`（loop 节点实际迭代次数）和 `branch`（branch 节点实际执行的分支名）字段
- 新增完整四种执行模式示例：`examples/workflowAgent.demo.ts`

### 变更
- `WorkflowNode` 联合类型由 4 种扩展为 6 种（新增 `BranchNode`、`LoopNode`），完全向后兼容
- `WorkflowEngine` 内部 DAG 执行器改为递归实现，支持嵌套子 DAG（branch/loop 内部）
- 插值正则由 `{\w+}` 扩展为 `{[\w-]+}`，支持含连字符的节点 id（如 `refine-loop`）

---

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
