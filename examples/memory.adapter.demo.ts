import {MemoryManager, type AddMemoryOptions} from "../src/memory/manager";
import {AdapterFactory, AdapterRegistry} from "../src/memory/storage";
import type {AdapterConfig} from "../src/memory/storage";

/**
 * 存储适配层集成示例
 * 演示如何使用工厂模式创建适配器、注册到管理器、以及使用降级策略
 */

async function demonstrateAdapterIntegration() {
  console.log("=== Memory 存储适配层集成示例 ===\n");

  // 1. 使用工厂创建适配器配置
  console.log("1. 创建适配器配置...");
  const adapterConfigs: AdapterConfig[] = [
    {type: "kvStore", backend: "memory"},
    {type: "vectorStore", backend: "memory"},
    {type: "graphStore", backend: "memory"},
    {type: "blobStore", backend: "memory"},
  ];

  // 2. 创建 MemoryManager 并注入适配器
  console.log("2. 初始化 MemoryManager...");
  const manager = new MemoryManager({
    userId: "demo_user",
    enableWorking: true,
    enableEpisodic: true,
    enableSemantic: true,
    enablePerceptual: true,
    adapterConfigs,
  });

  // 3. 初始化管理器（启动适配器生命周期）
  await manager.initialize();
  console.log("✓ MemoryManager 已初始化\n");

  // 4. 检查适配器健康状态
  console.log("3. 检查适配器健康状态...");
  const registry = manager.getAdapterRegistry();
  const health = await registry.checkHealth();
  console.log("适配器健康状态:", health);
  console.log("整体健康:", registry.isHealthy() ? "✓ 健康" : "✗ 异常\n");

  // 5. 添加不同类型的记忆
  console.log("4. 添加不同类型的记忆...");

  const workingMemoryId = await manager.addMemory({
    content: "当前正在处理的任务：实现存储适配层",
    memoryType: "working",
    importance: 0.9,
    metadata: {priority: "high"},
  });
  console.log(`✓ 工作记忆已添加: ${workingMemoryId}`);

  const episodicMemoryId = await manager.addMemory({
    content: "今天完成了 Memory 适配层的架构设计和实现",
    memoryType: "episodic",
    importance: 0.8,
    metadata: {session_id: "session_001", priority: "high"},
  });
  console.log(`✓ 情景记忆已添加: ${episodicMemoryId}`);

  const semanticMemoryId = await manager.addMemory({
    content: "存储适配层是一个统一的抽象，支持多种后端存储的可插拔接入",
    memoryType: "semantic",
    importance: 0.85,
    metadata: {priority: "high"},
  });
  console.log(`✓ 语义记忆已添加: ${semanticMemoryId}\n`);

  // 6. 检索记忆
  console.log("5. 检索记忆...");
  const results = await manager.retrieveMemories({
    query: "存储适配层",
    limit: 5,
  });
  console.log(`检索到 ${results.length} 条记忆:`);
  results.forEach((item, idx) => {
    console.log(
      `  ${idx + 1}. [${item.memoryType}] ${item.content.slice(0, 50)}... (重要度: ${item.importance.toFixed(2)})`,
    );
  });
  console.log();

  // 7. 获取统计信息
  console.log("6. 获取记忆统计信息...");
  const stats = await manager.getMemoryStats();
  console.log(`总记忆数: ${stats.totalMemories}`);
  console.log("各类型记忆统计:");
  for (const [type, typeStats] of Object.entries(stats.memoriesByType)) {
    const count = (typeStats as {count?: number}).count ?? 0;
    console.log(`  - ${type}: ${count} 条`);
  }
  console.log();

  // 8. 更新记忆
  console.log("7. 更新记忆...");
  const updated = await manager.updateMemory({
    memoryId: workingMemoryId,
    importance: 0.95,
    metadata: {priority: "critical"},
  });
  console.log(`✓ 记忆已更新: ${updated ? "成功" : "失败"}\n`);

  // 9. 演示降级策略
  console.log("8. 演示适配器降级策略...");
  console.log("当外部存储不可用时，系统会自动回退到内存实现");
  console.log("这确保了系统的可用性和容错能力\n");

  // 10. 清理资源
  console.log("9. 清理资源...");
  await manager.shutdown();
  console.log("✓ MemoryManager 已关闭\n");

  console.log("=== 示例完成 ===");
}

/**
 * 演示多用户场景
 */
async function demonstrateMultiUserScenario() {
  console.log("\n=== 多用户场景示例 ===\n");

  const adapterConfigs: AdapterConfig[] = [
    {type: "kvStore", backend: "memory"},
    {type: "vectorStore", backend: "memory"},
    {type: "graphStore", backend: "memory"},
  ];

  // 为两个用户创建独立的 MemoryManager
  const user1Manager = new MemoryManager({
    userId: "user_1",
    adapterConfigs,
  });

  const user2Manager = new MemoryManager({
    userId: "user_2",
    adapterConfigs,
  });

  await user1Manager.initialize();
  await user2Manager.initialize();

  // 用户 1 添加记忆
  console.log("用户 1 添加记忆...");
  await user1Manager.addMemory({
    content: "我喜欢 TypeScript",
    memoryType: "semantic",
    importance: 0.8,
  });

  // 用户 2 添加记忆
  console.log("用户 2 添加记忆...");
  await user2Manager.addMemory({
    content: "我喜欢 Python",
    memoryType: "semantic",
    importance: 0.8,
  });

  // 各自检索
  const user1Results = await user1Manager.retrieveMemories({
    query: "语言",
    limit: 5,
  });

  const user2Results = await user2Manager.retrieveMemories({
    query: "语言",
    limit: 5,
  });

  console.log(`用户 1 检索结果: ${user1Results.length} 条`);
  console.log(`用户 2 检索结果: ${user2Results.length} 条\n`);

  await user1Manager.shutdown();
  await user2Manager.shutdown();

  console.log("✓ 多用户场景演示完成");
}

/**
 * 演示记忆巩固流程
 */
async function demonstrateConsolidation() {
  console.log("\n=== 记忆巩固流程示例 ===\n");

  const adapterConfigs: AdapterConfig[] = [
    {type: "kvStore", backend: "memory"},
  ];

  const manager = new MemoryManager({
    userId: "consolidation_demo",
    adapterConfigs,
  });

  await manager.initialize();

  // 添加多个工作记忆
  console.log("添加工作记忆...");
  for (let i = 0; i < 5; i++) {
    await manager.addMemory({
      content: `工作任务 ${i + 1}`,
      memoryType: "working",
      importance: 0.5 + i * 0.1,
    });
  }

  const beforeStats = await manager.getMemoryStats();
  console.log(`工作记忆数: ${(beforeStats.memoriesByType.working as {count?: number}).count ?? 0}`);

  // 巩固记忆（从工作记忆到情景记忆）
  console.log("\n执行记忆巩固...");
  const consolidated = await manager.consolidateMemories({
    fromType: "working",
    toType: "episodic",
    importanceThreshold: 0.7,
  });
  console.log(`✓ 巩固了 ${consolidated} 条记忆\n`);

  const afterStats = await manager.getMemoryStats();
  console.log(`巩固后 - 工作记忆: ${(afterStats.memoriesByType.working as {count?: number}).count ?? 0}`);
  console.log(`巩固后 - 情景记忆: ${(afterStats.memoriesByType.episodic as {count?: number}).count ?? 0}`);

  await manager.shutdown();
}

// 运行示例
async function main() {
  try {
    await demonstrateAdapterIntegration();
    await demonstrateMultiUserScenario();
    await demonstrateConsolidation();
  } catch (error) {
    console.error("示例执行出错:", error);
    process.exit(1);
  }
}

main();
