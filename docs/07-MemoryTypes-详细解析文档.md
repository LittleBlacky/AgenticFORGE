# Memory Types 详细解析文档

## 一、整体定位

`src/memory/types` 提供了 **记忆系统的基础类型与四类记忆实现**：

- `BaseMemory`：抽象基类，约束统一 API
- **四类记忆**：
  1. `WorkingMemory`：短期/上下文记忆（会话内的临时信息）
  2. `EpisodicMemory`：情景/事件记忆（按 session 组织的经历）
  3. `SemanticMemory`：语义/知识记忆（向量检索 + 实体关系）
  4. `PerceptualMemory`：感知多模态记忆（文本/图像/音频等）

这些类型由 `MemoryManager` 统一调度，对上层 `MemoryTool` 暴露一致的使用体验。

---

## 二、基础类型与抽象基类（base.ts）

### 2.1 MemoryType / MemoryItem / MemoryConfig

- `MemoryType`：四类记忆枚举
- `MemoryItem`：统一数据结构（id、content、importance、metadata）
- `MemoryConfig`：配置项（存储路径、容量、衰减、TTL、模态等）

当前 `MemoryConfig` 字段包括：

- `storagePath`：本地存储默认路径
- `maxCapacity`：全局最大容量
- `importanceThreshold`：重要性阈值
- `decayFactor`：时间衰减系数
- `workingMemoryCapacity`：工作记忆条目容量
- `workingMemoryTokens`：工作记忆 token 上限
- `workingMemoryTtlMinutes`：工作记忆 TTL
- `perceptualMemoryModalities`：感知记忆支持的模态

默认配置由 `DEFAULT_MEMORY_CONFIG` 给出，后续可被 `MemoryManager` 覆盖。

### 2.2 BaseMemory 抽象基类

`BaseMemory` 定义了所有记忆类型必须实现的核心方法：

- `add`：写入一条记忆，返回记忆 ID
- `retrieve`：按 query 检索相关记忆（返回 MemoryItem 列表）
- `update`：更新指定记忆的内容/重要性/元信息
- `remove`：删除指定记忆
- `hasMemory`：检查某条记忆是否存在
- `clear`：清空该类型记忆
- `getStats`：返回该类型记忆的统计信息

并提供通用工具方法：

- `generateId()`：封装 `randomUUID()`，用于生成记忆 ID
- `calculateImportance()`：基于文本长度与关键词估算重要性

> 这确保了所有 Memory 实现具有统一的接口契约与可替换性。

---

## 三、WorkingMemory（working.ts）

### 3.1 定位

- 代表“短期工作记忆”
- 强调 **容量、token、时效** 三类限制

### 3.2 关键机制

1. **TTL 过期**：`expireOldMemories` 基于 `workingMemoryTtlMinutes`
   - 代码位置：`WorkingMemory.expireOldMemories()`
   - 逻辑：
     - 计算 cutoff：`Date.now() - maxAgeMinutes * 60 * 1000`
     - 过滤掉 `timestamp` 早于 cutoff 的记忆
     - 重新计算 `currentTokens`
   - 作用：保证工作记忆只保留最近一段时间的上下文，避免长期污染。

2. **容量控制**：`maxCapacity` + `maxTokens`
   - 代码位置：`enforceCapacityLimits()`
   - 触发点：`add()` / `update()` 中追加或修改后调用
   - 逻辑：
     - 当 `memories.length > maxCapacity` 或 `currentTokens > maxTokens` 时循环剔除
     - 每次调用 `removeLowestPriorityMemory()` 删除最低优先级条目
   - 作用：确保容量与 token 上限双约束，防止上下文爆炸。

3. **优先级淘汰**：`removeLowestPriorityMemory` 依据重要性 + 时间衰减
   - 代码位置：`removeLowestPriorityMemory()` + `calculatePriority()`
   - 逻辑：
     - `priority = importance * timeDecay`
     - `timeDecay = decayFactor^(hoursPassed/6)`，最低不低于 0.1
     - 选择 priority 最低的记忆进行删除
   - 作用：优先淘汰“旧且不重要”的记忆。

4. **检索排序**：`keywordScore * timeDecay * importanceWeight`
   - 代码位置：`retrieve()`
   - 逻辑：
     - `keywordScore(query, content)`：关键词命中度（空 query 返回 0.1）
     - `timeDecay(timestamp)`：时间衰减因子
     - `importanceWeight = 0.8 + importance * 0.4`
     - 最终 `score = keywordScore * timeDecay * importanceWeight`
   - 作用：让检索结果同时考虑“相关性 + 新近度 + 重要性”。

5. **显式遗忘**：`forget(strategy, threshold, maxAgeDays)`
   - 代码位置：`forget()`
   - 支持策略：
     - `importance_based`：低于阈值直接剔除
     - `time_based`：按时间窗口清理
     - `capacity_based`：超出容量时保留优先级高的条目
   - 作用：提供手动清理接口，方便在任务结束或上下文切换时快速整理工作记忆。

### 3.3 辅助能力（逐项解析）

- `getRecent(limit)`
  - **做什么**：按时间倒序取最近的 N 条工作记忆。
  - **实现逻辑**：
    - `memories.sort((a,b)=>b.timestamp-a.timestamp).slice(0, limit)`
  - **适用场景**：
    - 需要恢复“最近对话线索”或“刚发生的上下文”。

- `getImportant(limit)`
  - **做什么**：按重要性倒序取最重要的 N 条记忆。
  - **实现逻辑**：
    - `memories.sort((a,b)=>b.importance-a.importance).slice(0, limit)`
  - **适用场景**：
    - 快速抓取“高价值要点”，用于回答“最关键的信息是什么”。

- `getAll()`
  - **做什么**：返回全部工作记忆（浅拷贝）。
  - **实现逻辑**：
    - `return this.memories.slice()`
  - **适用场景**：
    - 需要在上层做自定义筛选或调试。

- `getContextSummary(maxLength)`
  - **做什么**：把当前工作记忆压缩成可放进 prompt 的摘要文本。
  - **实现逻辑**：
    - 先按 `priority = importance * timeDecay` 排序
    - 依次拼接内容，直到达到 `maxLength`
    - 最后一条不足时截断并补 `...`
  - **适用场景**：
    - 给 LLM 提供“当前上下文摘要”，避免 prompt 超长。

这些辅助能力用于“快速筛选 / 快速摘要 / 快速导出”，是工作记忆在工程场景中最常用的支撑接口。

### 3.4 适用场景（举例分析）

- **LLM 当前会话上下文**
  - 例子：用户在同一轮对话里先说“我要写一份周报模板”，接着又说“加上本周关键成果”。
  - 分析：工作记忆会保留“周报模板”这个上下文，使第二轮回答能直接复用前提。

- **临时任务线索**
  - 例子：用户说“帮我记一下今天会议的三个决策点：A/B/C”，随后问“把刚才的决策点整理成一句话”。
  - 分析：工作记忆作为短期暂存区，能让系统快速提取刚记录的 A/B/C。

- **一次对话内多轮信息**
  - 例子：用户先问“帮我生成一个招聘 JD”，再追加“岗位是前端，强调 React 和性能优化”。
  - 分析：多轮补充的信息都在工作记忆里累积，保证最终输出包含所有约束。

---

## 四、EpisodicMemory（episodic.ts）

### 4.1 定位

- 记录“事件/经历”（也就是一次完整互动的可追溯过程）
- 以 **session 为核心组织结构**

**什么是 session？**

在本项目里，session 可以理解为“一段连续对话/一次任务链路”的标识。它用于把同一段交互产生的记忆归在一起，而不是和别的任务混在一堆。

例子：

- **Session A（登录页优化）**
  1. 用户：帮我设计登录页布局（记忆：session_A#1）
  2. 用户：加上验证码与错误提示（记忆：session_A#2）
  3. 用户：补一个忘记密码入口（记忆：session_A#3）

- **Session B（支付接入）**
  1. 用户：接入微信支付流程（记忆：session_B#1）
  2. 用户：处理支付回调与订单状态（记忆：session_B#2）

检索时可以只查 `session_A`，就不会混入支付相关记忆。这样就能做到“同会话聚合，跨会话隔离”。

### 4.2 数据结构

`EpisodicMemory` 内部把每条记忆包装成 `Episode`，并额外维护 `sessions` 索引：

- `Episode`：
  - `sessionId`：会话 id
  - `context`：会话上下文（可用于存放阶段信息）
  - `outcome`：阶段性结果（可用于总结/回溯）

- `sessions: Map<string, string[]>`：
  - key 是 `sessionId`
  - value 是该会话下所有 episodeId 的集合

这个结构让 `EpisodicMemory` 可以：

- 快速按 session 找到该会话下所有事件
- 在检索时按 sessionId 过滤，避免跨会话串联

换句话说，session 就是“事件记忆的索引维度”，它让 EpisodicMemory 既能按时间回溯，也能按任务分组。

### 4.3 检索机制（结合代码）

EpisodicMemory 的检索逻辑在 `episodic.ts` 的 `retrieve(...)` 中，支持 **向量检索（有 vectorStore 时）** 与 **内存回退检索** 两条路径：

#### 4.3.1 向量检索路径（可选）

当配置了 `vectorStore` 时，会优先走向量检索：

1. **query 向量化 + 过滤**
   - 使用 `HashTextEmbedder` 生成 query 向量
   - 过滤条件支持：`userId` / `sessionId` / `memoryType`

2. **候选集评分**
   - 读取 payload + kvStore 中的 MemoryItem
   - 计算 `vecScore`（向量相似度）与 `recencyScore`
   - 最终得分：`(vecScore * 0.8 + recencyScore * 0.2) * importanceWeight`

3. **额外过滤**
   - 支持 `timeRange` 与 `importanceThreshold`
   - 当 metadata.context.forgotten 为 true 时直接跳过

该路径会返回更接近“语义相似 + 近期 + 重要”的 episodic 记忆，同时支持更丰富的过滤条件。

#### 4.3.2 内存回退路径

当没有 `vectorStore` 时，回退到内存数组检索，核心仍是“**关键词匹配 + 新近度 + 重要性加权**”，并支持 **sessionId / userId 过滤**：

1. **sessionId / userId 过滤**

```ts
const userId = typeof options.userId === "string" ? options.userId : undefined;
const sessionId =
  typeof options.sessionId === "string" ? options.sessionId : undefined;

this.episodes
  .filter((e) => (userId ? e.userId === userId : true))
  .filter((e) => (sessionId ? e.sessionId === sessionId : true));
```

这一步确保：

- 先按用户隔离（多用户不串）
- 再按 session 限定范围（同一次任务/对话为主）

2. **关键词命中**

```ts
const keyword = q ? (e.content.toLowerCase().includes(q) ? 1 : 0) : 0.2;
```

- 有 query 时：命中即 1，否则 0
- 无 query 时：给 0.2 作为基础得分（避免全 0）

3. **新近度衰减**

```ts
const recency = 1 / (1 + (Date.now() - e.timestamp.getTime()) / 86400000);
```

越新的 episode 分数越高，随时间衰减。

**文字版公式说明**：可理解为

\[
recency = \frac{1}{1 + \Delta days}
\]

其中 \(\Delta days\) 是距现在的天数，时间越久分数越小。

4. **重要性权重**

```ts
const impWeight = 0.8 + e.importance * 0.4;
```

重要性从 0~1 被映射到 0.8~1.2 的权重区间。

**文字版公式说明**：可理解为

\[
impWeight = 0.8 + 0.4 \times importance
\]

重要性越高，最终得分被放大。

5. **合成最终得分**

```ts
const score = (keyword * 0.8 + recency * 0.2) * impWeight;
```

- 关键词更重要（80%）
- 新近度作为辅助（20%）
- 最后再乘以重要性权重

**文字版公式说明**：

\[
score = (0.8 \times keyword + 0.2 \times recency) \times (0.8 + 0.4 \times importance)
\]

这意味着“既相关、又新、且重要”的记忆会排在更前面。

**数值示例**（便于直观理解）：

- 假设 query 命中：`keyword = 1`
- 距离现在 2 天：
  - \(recency = 1 / (1 + 2) = 0.333\)
- 重要性为 0.7：
  - \(impWeight = 0.8 + 0.4 \times 0.7 = 1.08\)

则：

\[
score = (0.8 \times 1 + 0.2 \times 0.333) \times 1.08
\]

\[
score \approx (0.8 + 0.0666) \times 1.08 \approx 0.936
\]

如果另一条记忆距离 10 天（recency
\(= 1/(1+10)=0.0909\)）且重要性仅 0.3（impWeight=0.92），即便关键词命中，最终得分也会明显更低。

通过这一套计算，EpisodicMemory 能在“同会话范围”内优先返回**最近且更重要**的事件记忆。

### 4.4 适用场景

- **对话历史回溯**：
  - 例如“上次讨论的登录页有哪些改动点？”
  - 通过 sessionId 定位到那一次对话中的 episode，再汇总关键内容。

- **用户行为轨迹**：
  - 例如“这个用户最近 3 次都在优化支付流程”
  - 从 episodic 记忆里筛出多个 session，发现相似主题反复出现。

- **任务阶段性记录**：
  - 例如“需求评审 → 技术方案 → 开发排期”
  - 每个阶段写入一个 episode，回溯时可按阶段复盘进度与结论。

---

## 五、SemanticMemory（semantic.ts）

### 5.1 定位

- 存储“事实/概念/知识”（面向稳定知识，而非短期对话）
- 内置轻量知识图谱结构（实体 + 关系）

**详细解释**：

- **事实/概念/知识** 指的是“跨会话长期有效”的信息，例如：
  - “JWT 是一种无状态认证机制”
  - “React 18 默认启用并发特性”
  - “公司前端工程规范要求使用 ESLint + Prettier”

  这类内容不会因为对话轮次变化而失效，适合进入语义记忆。

- **轻量知识图谱** 在这里并不是复杂的图数据库，而是两类内部结构：
  - `Entity`：从文本中抽取的概念实体（如 `React`、`JWT`、`并发渲染`）
  - `Relation`：实体之间的共现关系（`CO_OCCURS`），用于给检索加一层“图谱相关度”

### 5.2 数据结构

- `Entity`：概念实体
- `Relation`：实体关系
- embeddings：向量检索基线
  - 指把文本编码成向量（embedding），并用向量相似度作为最基础的检索能力
  - 在 `SemanticMemory` 中使用 `HashTextEmbedder` 生成向量，再用 `cosine(qv, mv)` 计算相似度
  - 即便没有图谱关系，也能依赖 embedding 完成语义检索

**对应数据结构代码（semantic.ts）**：

```109:135:src/memory/types/semantic.ts
export interface Entity {
  entityId: string;
  name: string;
  entityType: string;
  description: string;
  properties: Record<string, unknown>;
  frequency: number;
}

export interface Relation {
  fromEntity: string;
  toEntity: string;
  relationType: string;
  strength: number;
  evidence: string;
  properties: Record<string, unknown>;
  frequency: number;
}
```

**解释**：

- `Entity` 描述“概念节点”：
  - `entityId` 是唯一标识（由名称 hash）
  - `name` 是实体名（从文本抽取）
  - `entityType/description/properties` 预留扩展
  - `frequency` 统计实体出现次数

- `Relation` 描述“关系边”：
  - `fromEntity/toEntity` 指向两个实体
  - `relationType` 当前固定为 `CO_OCCURS`
  - `strength` 关系强度（后续可用于排序/过滤）
  - `evidence` 保留文本片段作为关系证据
  - `frequency` 统计共现次数

这些结构足以形成一个“轻量语义图”，用于在向量检索之外补充概念相关度信号。

语义记忆检索时会同时看“向量相似度”和“实体图谱相关度”，让结果不仅靠文本相似，也能靠概念关系辅助排序。

### 5.3 检索机制

- **向量相似度**：`SemanticMemory.retrieve` 使用 `HashTextEmbedder` 把 query 与记忆内容编码成向量，然后用 `cosine(qv, mv)` 计算相似度。
  - 这保证了“语义近似”的记忆更靠前。

- **图谱相关度**：`graphScore(entityIds, query)` 会把 query 里的词和已抽取的 `Entity` 名称做匹配，命中越多，图谱分数越高。
  - 这让“概念相关但措辞不同”的内容也有机会被拉上来。

- **融合策略**：`base = vectorScore * 0.7 + graphScore * 0.3`，再乘以 `importance` 权重。
  - 即 70% 依赖向量语义相似度，30% 依赖图谱概念匹配。
  - 最终排序兼顾“语义相似”与“概念关系”。

- **外部适配器优先**：当配置了 `vectorStore` 或 `graphStore` 时，会优先走适配器结果合并，`mergeAdapterResults` 会对向量结果与图谱结果做去重合并，并写入 `combined_score`、`vector_score`、`graph_score` 供上层观察。

### 5.4 适用场景（丰富示例）

- **知识库记忆**
  - 例子：记录“JWT 的定义、刷新机制、常见风险”，后续可以直接用语义检索快速回答“JWT 的安全注意点”。

- **概念与事实关联**
  - 例子：在同一条语义记忆里出现“React 并发渲染”和“useTransition”，图谱共现让模型在问到“并发渲染相关 API”时更容易召回。

- **语义相似检索**
  - 例子：用户问“如何减少首屏白屏时间”，即使记忆里写的是“首屏渲染优化策略”，向量相似度依然能把相关记忆排到前面。

---

## 六、PerceptualMemory（perceptual.ts）

### 6.1 定位

- 多模态感知记忆（文本/图像/音频/视频/结构化）
- 以模态为主索引，可跨模态检索

### 6.2 数据结构

- `Perception`：感知编码对象
- `modalityIndex`：模态 -> perceptionId[]
- `perceptualMemories`：保留原始 MemoryItem
- `perceptions`：感知编码缓存

### 6.3 检索机制

- 文本模态：`HashTextEmbedder` 编码
- 其他模态：`hashToVector` 生成伪向量
- 相似度 + 新近度加权
- 若配置 `vectorStore` / `vectorStores`，优先走向量检索并合并评分

### 6.4 适用场景

- 多模态索引与回忆
- 跨模态检索（`crossModalSearch`）
- 生成模态内容（`generateContent` 伪实现）
- 按模态检索（`getByModality`）

---

## 七、类型导出（index.ts）

`index.ts` 作为统一出口：

- 导出 Base/Config/Type
- 导出四类 Memory 实现
- 导出 Episode/Entity/Relation/Perception 类型

这样上层模块可以通过 `memory/types` 单一入口完成类型依赖。

---

## 八、设计特点与局限

### 特点

1. **统一接口契约**：所有记忆类型共享 BaseMemory API。
2. **多策略检索**：不同记忆类型采用不同检索逻辑。
3. **轻量可扩展**：可添加新 Memory 类型并被 Manager 调度。

### 局限

1. **向量与图谱是简化实现**，检索质量有限。
2. **感知模态缺少真实 embedding**，目前是 hash 近似。
3. **working/episodic 的检索主要靠关键词**，深语义匹配不足。

---

## 九、演进建议

### P1（优先）

1. 替换 `HashTextEmbedder` 为真实向量模型
2. 引入 embedding rerank 提升结果质量

### P2（增强）

3. 统一记忆类型的评分接口，便于跨类型融合
4. 对 `PerceptualMemory` 增加真实多模态 embedding

### P3（工程化）

5. 增加持久化层（DB/向量库）
6. 引入冷热分层（Hot/Cold Memories）

---

## 十、总结

`src/memory/types` 提供了“记忆系统的四类实现 + 统一抽象”。它通过不同检索策略覆盖了短期上下文、事件经验、语义知识与多模态感知四类需求，为上层 `MemoryManager` 提供稳定的可扩展基座。
