# AgenticKIT 打包优化详细解析

## 1. 背景与目标

### 为什么需要优化

AgenticKIT 是一个 monorepo 结构的 SDK，包含 8 个子包：

```
utils -> core -> memory -> tools -> tools-builtin -> context -> agents -> kit
```

在优化之前，多个包的 rollup 配置存在严重问题：**`external` 字段使用了错误的旧包名**，导致本应被外部化的依赖被全量打包进 bundle。这不仅造成 bundle 体积虚高，还破坏了消费者侧的 tree shaking 能力。

### 优化目标

1. 修正所有包的 `external` 配置，确保跨包依赖不被重复打包
2. 验证 tree shaking 所需的全部条件均已满足
3. 量化 bundle 体积收益

## 2. Tree Shaking 的工作原理

### 核心机制

Tree shaking 由**消费者侧的 bundler**（Webpack / Vite / esbuild）在构建时执行，而非 SDK 自身构建时。SDK 的职责是：提供符合 tree shaking 前提条件的产物。

```
消费者代码
  import { ReActAgent } from @AgenticKIT/agents
        |
        v
    bundler 分析 ESM 静态导入图
        |
        v
    只打包 ReActAgent 及其实际依赖
    丢弃 PlanSolveAgent / ReflectionAgent 等未使用的导出
```

### 必要条件（全部满足才生效）

| 条件 | 作用 |
|------|------|
| `"sideEffects": false` | 告知 bundler：此包无副作用，未使用的模块可安全删除 |
| ESM 格式输出 | CJS 使用动态 require()，静态分析不可行；ESM 的 import/export 是静态的 |
| `exports.import` 条件 | 让支持 package exports 的 bundler 优先使用 ESM 入口 |
| `"module"` 字段 | 兼容不支持 exports 的旧 bundler（Webpack 4 等） |
| 依赖正确 externalized | 若依赖被打包进 bundle，消费者无法对该依赖做 tree shaking |

## 3. 问题根因分析

### 3.1 旧包名残留

项目在重构过程中包名从 `@agentickit/agents-*` 改为 `@AgenticKIT/*`，但多个包的 `rollup.config.mjs` 中 `external` 字段未同步更新，仍然引用旧包名：

```js
// 修复前：agents/rollup.config.mjs
external: [
  "@agentickit/agents-core",       // 旧包名，不存在
  "@agentickit/agents-context",    // 旧包名，不存在
  "@agentickit/agents-tools",      // 旧包名，不存在
]
```

由于 external 列表中的包名与实际导入的包名不匹配，rollup 无法识别这些依赖为外部依赖，转而将它们**全量解析并内联**进 bundle。

### 3.2 影响范围

| 包 | 问题 |
|----|------|
| `agents` | external 全为旧包名，所有 @AgenticKIT/* 依赖被打包进去 |
| `memory` | @AgenticKIT/core 用旧包名，被内联 |
| `context` | @AgenticKIT/core、@AgenticKIT/memory 用旧包名，被内联 |
| `tools-builtin` | @AgenticKIT/core 缺失，被内联（rollup 已有 unresolved warning） |

### 3.3 连锁效应

由于 `agents` 打包了所有依赖，消费者使用 `@AgenticKIT/kit` 时，实际引用的 `@AgenticKIT/agents` bundle 已经包含了重复代码，即使 `kit` 的 external 配置正确，也无法避免体积膨胀。

## 4. 修复方案

### 4.1 修复原则

**external 列表 = dependencies + peerDependencies 中所有包**

自身实现代码打包进 bundle，依赖包一律外部化。

### 4.2 各包修复详情

#### agents/rollup.config.mjs

```js
// 修复后
external: [
  "@AgenticKIT/core",
  "@AgenticKIT/context",
  "@AgenticKIT/tools",
  "@AgenticKIT/tools-builtin",
  "@AgenticKIT/memory",
  "reflect-metadata",
  "zod",
]
```

#### memory/rollup.config.mjs

```js
// 修复后
external: [
  "@qdrant/js-client-rest",
  "neo4j-driver",
  "openai",
  "@AgenticKIT/core",   // 新增，之前用旧包名
]
```

#### context/rollup.config.mjs

```js
// 修复后
external: [
  "js-tiktoken",
  "reflect-metadata",
  "zod",
  "@AgenticKIT/core",    // 修正旧包名
  "@AgenticKIT/memory",  // 修正旧包名
]
```

#### tools-builtin/rollup.config.mjs

```js
// 修复后
external: [
  "proper-lockfile",
  "@AgenticKIT/tools",
  "@AgenticKIT/memory",
  "@AgenticKIT/core",   // 新增，之前缺失
  "zod",
]
```

### 4.3 保持不变的包

| 包 | 原因 |
|----|------|
| `core` | external 只有 openai，正确 |
| `tools` | external 有 reflect-metadata、zod，正确 |
| `utils` | 无 @AgenticKIT/* 依赖，external 为空，正确 |
| `kit` | external 已正确列出所有 @AgenticKIT/*，正确 |

## 5. 结果验证

### 5.1 Bundle 体积对比（ESM）

| 包 | 修复前 | 修复后 | 减少 |
|----|--------|--------|------|
| utils | 1.9 kB | 1.8 kB | — |
| core | 46.4 kB | 45.3 kB | — |
| memory | 97.4 kB | 92.2 kB | -5% |
| tools | 10.5 kB | 10.3 kB | — |
| tools-builtin | 242.4 kB | 85.1 kB | **-65%** |
| context | 5.9 kB | 5.7 kB | — |
| agents | 368.1 kB | 28.8 kB | **-92%** |
| kit | 0.4 kB | 0.4 kB | — |

`agents` 从 368 kB 降至 28.8 kB，`tools-builtin` 从 242 kB 降至 85 kB。

### 5.2 Rollup 警告消除

修复前 `tools-builtin` 构建有警告：

```
(!) Unresolved dependencies
@AgenticKIT/core (imported by "src/rag.ts")
```

修复后该警告消失，@AgenticKIT/core 已被正确识别为外部依赖。

### 5.3 Tree Shaking 条件检查

```
[OK] sideEffects: false        — 所有 8 个包均已设置
[OK] ESM 输出                  — dist/esm/index.js
[OK] exports.import 条件       — 所有包 package.json 均配置
[OK] module 字段               — 所有包均指向 ESM
[OK] 依赖正确 externalized     — 修复后全部正确
[WARN] memory 内部循环依赖     — 不影响消费者，建议后续重构
```

## 6. 消费者侧效果示例

### 场景 1：只使用 ReActAgent

```ts
import { ReActAgent } from "@AgenticKIT/agents";
```

**修复前**：bundler 加载 agents ESM bundle（368 kB），其中包含了所有 agent 实现、@AgenticKIT/core、@AgenticKIT/context、@AgenticKIT/tools 的完整代码，无法 tree shake。

**修复后**：bundler 加载 agents ESM bundle（28.8 kB），只含 agents 自身实现，所有 @AgenticKIT/* 依赖作为外部模块单独加载。bundler 再对 agents bundle 内部做 tree shaking，只保留 ReActAgent 相关代码。

```
修复前消费者 bundle 中 agents 相关体积：~368 kB（无法 tree shake）
修复后消费者 bundle 中 agents 相关体积：~8-15 kB（只含 ReActAgent）
```

### 场景 2：通过 kit 一体包引入

```ts
import { ReActAgent, MemoryTool } from "@AgenticKIT/kit";
```

kit 是纯 re-export 包（0.4 kB），所有实现都在各子包中。bundler 会分别对每个子包做 tree shaking，最终只打包 ReActAgent 和 MemoryTool 的实际依赖链。

### 场景 3：按需引入子包（推荐）

```ts
// 按需引入，bundler 体积最优
import { ReActAgent } from "@AgenticKIT/agents";
import { MemoryTool } from "@AgenticKIT/tools-builtin";
import { ContextBuilder } from "@AgenticKIT/context";
```

---

## 7. 残留问题与演进建议

### 7.1 memory 内部循环依赖

```
src/embedding/index.ts
  -> src/embedding/factory.ts
    -> src/rag/pipeline.ts
      -> src/embedding/index.ts  (循环)
```

rollup 可以处理循环依赖，不影响产物正确性，但会阻碍包内部的 tree shaking。建议将 pipeline.ts 对 embedding 的依赖改为接口注入，解除循环。

### 7.2 core 包含 zod 内部循环

zod@4 自身有循环依赖（schemas.js <-> iso.js），这是 zod 的问题，等待 zod 上游修复。

### 7.3 后续可考虑的优化

| 优化项 | 收益 | 复杂度 |
|--------|------|--------|
| 为每个 Agent 类型提供独立入口 exports["./react-agent"] | 更细粒度 tree shaking | 中 |
| 为 tools-builtin 各工具提供独立入口 | 用户只引入需要的工具 | 中 |
| 生产构建开启 terser minify | 进一步压缩体积 20-40% | 低 |
| 拆解 memory 循环依赖 | 改善内部 tree shaking | 高 |

---

## 8. 最佳实践总结

编写 SDK rollup 配置时，external 应遵循以下规则：

```js
// 规则：external = 所有 dependencies + peerDependencies
// 自身实现代码打包，依赖全部外部化

external: [
  // 1. 同 monorepo 其他包
  "@AgenticKIT/core",
  "@AgenticKIT/memory",
  // 2. 三方依赖（在 dependencies 中的）
  "zod",
  "reflect-metadata",
  // 3. 可选的大型依赖（在 peerDependencies 中的）
  "@qdrant/js-client-rest",
  "neo4j-driver",
]
// 不要 external：自己写的工具函数、内联的 polyfill
```

**包名必须与 package.json 中的实际包名完全一致**，大小写敏感，否则 rollup 无法匹配。