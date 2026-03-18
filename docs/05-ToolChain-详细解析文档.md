# ToolChain 详细解析文档

## 1. 背景与目标

`ToolChain` 的设计目标是：把多个工具按顺序编排成一条可复用的执行链，让“单工具能力”升级为“多步骤自动化流程”。

在这个项目里，`ToolChain` 主要解决三类问题：

1. **串联执行**：把多个工具按步骤依次执行。
2. **上下文传递**：前一步结果可作为后一步输入（模板变量替换）。
3. **流程复用**：把可重复流程注册为命名 chain，由 `ToolChainManager` 统一管理。

对应实现文件：`src/tools/chain.ts`

---

## 2. 模块结构概览

当前模块由 5 部分组成：

1. 类型定义：`ChainStep`、`ChainInfo`
2. 模板渲染函数：`renderTemplate`
3. 执行实体：`ToolChain`
4. 管理器：`ToolChainManager`
5. 便捷构建函数：`createResearchChain`、`createSimpleChain`

---

## 3. 核心数据结构

## 3.1 `ChainStep`

```ts
interface ChainStep {
  toolName: string;
  inputTemplate: string;
  outputKey: string;
}
```

含义：

- `toolName`：本步骤调用哪个工具（由 `ToolRegistry` 解析并执行）。
- `inputTemplate`：本步骤输入模板，支持变量占位，如 `{input}`、`{search_result}`。
- `outputKey`：本步骤输出写入运行时上下文的键名，供后续步骤引用。

## 3.2 `ChainInfo`

```ts
interface ChainInfo {
  name: string;
  description: string;
  steps: number;
  stepDetails: ChainStep[];
}
```

用于管理层查询链路信息，适合做 UI 展示、日志输出、调试检查。

---

## 4. 模板变量机制

## 4.1 `renderTemplate(template, context)`

职责：在字符串模板中用上下文变量替换占位符。

规则：

- 模板语法：`{key}`
- 变量来源：运行时 `context`
- 未命中变量：直接抛错（`模板变量 'xxx' 未定义`）

设计取舍：

- **严格失败**而非静默替换为空字符串：
  - 好处：流程配置错误能尽早暴露；
  - 风险：对模板正确性要求更高。

示例：

- 模板：`"请总结：{search_result}"`
- 上下文：`{ search_result: "A公司营收增长" }`
- 输出：`"请总结：A公司营收增长"`

---

## 5. `ToolChain` 执行模型

## 5.1 构造与步骤注册

```ts
const chain = new ToolChain("research_growth_rate", "搜索并计算同比增长率");
chain.addStep("search", "{input}", "search_result");
chain.addStep("extract_growth_expr", "{search_result}", "calc_expr");
```

`addStep` 行为：

- 追加一个步骤到内部 `steps` 数组。
- 若未传 `outputKey`，自动生成 `step_${index}_result`。

## 5.2 执行入口 `execute(...)`

签名：

```ts
execute(registry, inputData, context?) => Promise<string>
```

执行流程：

1. **空链校验**
   - `steps.length === 0` 时直接返回错误文本。

2. **初始化运行时上下文**
   - 以传入 `context` 为基础，强制注入 `input: inputData`。

3. **遍历执行每一步**
   - 用 `renderTemplate` 计算 `actualInput`。
   - 调用 `registry.execute(toolName, { input: actualInput })`。
   - 将结果写入 `runtimeContext[outputKey]`。
   - 更新 `finalResult` 为当前步骤结果。

4. **错误处理**
   - 模板替换失败：返回 `❌ 模板变量替换失败: ...`
   - 工具执行失败：返回 `❌ 工具 'xxx' 执行失败: ...`

5. **成功结束**
   - 返回最后一步结果 `finalResult`。

说明：

- 当前实现是“线性同步语义”（按顺序逐步 await），保证步骤之间有确定的依赖关系。

---

## 6. `ToolChainManager` 管理模型

`ToolChainManager` 负责把“单条 chain 执行能力”升级为“多 chain 目录与调度能力”。

主要方法：

1. `registerChain(chain)`
   - 按 `chain.name` 注册到内部 map。

2. `executeChain(chainName, inputData, context?)`
   - 按名称查找 chain 并执行。
   - 不存在时返回 `❌ 工具链 'xxx' 不存在`。

3. `listChains()`
   - 返回所有已注册 chain 名称。

4. `getChainInfo(chainName)`
   - 返回链路描述、步骤数、步骤详情；不存在返回 `null`。

---

## 7. 与 `ToolRegistry` 的协作关系

`ToolChain` 本身不负责工具注册与参数校验，它依赖 `ToolRegistry` 做能力分发。

协作边界：

- `ToolChain`：负责编排（顺序、上下文、模板）
- `ToolRegistry`：负责执行（查找工具、校验参数、调用实现）

当前参数交互约定：

- `ToolChain` 统一传 `{ input: actualInput }`
- 具体工具自行决定是否只读 `input`，或进一步解析其内容

这个约定让 chain 层保持轻量，不绑定某个工具的复杂参数结构。

---

## 8. 一个完整链路示例

以 `examples/toolChain.demo.ts` 中的 `research_growth_rate` 为例：

1. `search`：输入用户问题，输出带“今年/去年”数字的文本
2. `extract_growth_expr`：从上一步文本提取表达式，如 `(128 - 96) / 96 * 100`
3. `my_calculator`：计算表达式，得到数值
4. `summarize`：汇总问题、检索结果、表达式、计算结果

变量传递示意：

- 初始：`context.input = 用户输入`
- 步骤1结束：`context.search_result = ...`
- 步骤2结束：`context.calc_expr = ...`
- 步骤3结束：`context.calc_result = ...`
- 步骤4使用上述变量拼装最终输出

这说明 `ToolChain` 的核心价值不是“调用工具”，而是“让工具结果在流程中可编排地流动”。

---

## 9. 当前实现的优势与局限

### 9.1 优势

1. **实现简单可读**：线性链路，容易理解和维护。
2. **错误可解释**：模板和工具错误都能返回明确文本。
3. **低耦合**：chain 编排与工具实现解耦，复用性高。
4. **快速落地**：通过模板就能构建可用工作流。

### 9.2 局限

1. **参数结构单一**
   - 当前固定传 `{input}`，不适合复杂结构化入参工具。

2. **无分支/条件能力**
   - 只能顺序执行，不支持 if/else、循环、并行分支。

3. **错误策略较简单**
   - 失败即中断并返回，没有重试与补偿机制。

4. **缺少执行追踪对象**
   - 仅返回 final result，未返回完整 step trace（耗时、每步输入输出等）。

---

## 10. 可演进方向

### P1（短期）

1. 增加 `executeDetailed()`：返回每步输入、输出、耗时、状态。
2. 增加可配置重试：`maxRetries` + `retryDelayMs`。
3. 在模板渲染中支持默认值语法（如 `{key|default}`）。

### P2（中期）

4. 支持结构化参数模板：
   - 从 `inputTemplate: string` 扩展到 `inputBuilder: object | function`。
5. 支持错误分支：
   - 某步失败时走 fallback 步骤。

### P3（长期）

6. 支持 DAG/并行节点：
   - 与 `AsyncToolExecutor` 融合，提升吞吐。
7. 可视化编排：
   - chain 定义可导出 JSON，供前端配置化编辑。

---

## 11. 总结

`ToolChain` 在当前项目中是一个“轻编排层”：

- 上承 `ToolRegistry` 的工具生态
- 下接业务流程自动化需求

它以最小复杂度提供了“顺序编排 + 上下文变量传递 + 统一管理”的能力，是后续演进到更复杂工作流（带重试、分支、并行）的基础。
