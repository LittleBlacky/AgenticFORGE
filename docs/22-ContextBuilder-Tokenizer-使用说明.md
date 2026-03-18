# ContextBuilder Tokenizer 使用说明与迁移指引

## 1. 背景
`ContextBuilder` 需要精确的 token 计数来控制上下文预算。
原实现采用粗略估算（字符数 / 4），在长文本与多语言场景下误差较大。
本次演进引入可插拔 `Tokenizer`，并支持 lazy 单例缓存与可选依赖回退。

## 2. 新增能力概览
- **可插拔 token 计数器**：通过 `ContextConfig.tokenCounter` 注入。
- **真实 tokenizer 支持**：默认集成 `js-tiktoken`（`cl100k_base`）。
- **lazy 单例缓存**：同一编码名称复用实例，避免重复初始化。
- **可选依赖兼容**：未安装 `js-tiktoken` 时自动回退到粗略估算。

## 3. 使用方式
### 3.1 推荐用法（真实 tokenizer）
```ts
import {ContextBuilder, createTokenCounter} from "./context";

const builder = new ContextBuilder({
  config: {
    tokenCounter: createTokenCounter({ encodingName: "cl100k_base" }),
  },
});
```

### 3.2 维持默认估算
```ts
import {ContextBuilder} from "./context";

const builder = new ContextBuilder();
```

### 3.3 自定义 tokenizer
```ts
import {ContextBuilder, type TokenCounter} from "./context";

const myCounter: TokenCounter = (text) => {
  // 自定义 token 计数
  return Math.ceil(text.length / 3);
};

const builder = new ContextBuilder({
  config: { tokenCounter: myCounter },
});
```

## 4. 迁移指引
### 4.1 旧代码（无需改动）
旧调用方式不变，仍可使用默认估算。

### 4.2 想启用真实 tokenizer
1. 确保依赖已安装：
   ```bash
   pnpm add js-tiktoken
   ```
2. 在 `ContextBuilder` 配置中传入 `createTokenCounter`。

## 5. 运行时回退策略
- 如果 `js-tiktoken` 未安装或初始化失败：
  - 控制台会提示警告。
  - 自动回退到 `roughCountTokens` 估算逻辑，保证功能可用。

## 6. API 参考
- `Tokenizer`：封装 tokenizer 的实例化逻辑。
- `createTokenCounter`：返回可直接注入 `ContextConfig` 的计数函数。
- `roughCountTokens`：粗略估算函数（字符数 / 4）。

## 7. 注意事项
- 多语言场景建议启用真实 tokenizer。
- 如果部署环境无法安装 `js-tiktoken`，可依赖自动回退。
- 多进程环境建议复用单例，避免重复初始化带来的开销。
