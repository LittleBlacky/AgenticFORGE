# @agenticforge/protocols

[![npm](https://img.shields.io/npm/v/@agenticforge/protocols)](https://www.npmjs.com/package/@agenticforge/protocols)
[![license](https://img.shields.io/github/license/LittleBlacky/AgenticFORGE)](https://github.com/LittleBlacky/AgenticFORGE/blob/main/LICENSE)

<p><strong>中文</strong> | <a href="./README.md">English</a></p>

AgenticFORGE 三大核心智能体通信协议的 TypeScript 实现：MCP、A2A、ANP。

## 安装

```bash
npm install @agenticforge/protocols
```

## 协议概览

| 协议 | 全称 | 主要用途 | 核心类 |
|------|------|----------|--------|
| **MCP** | Model Context Protocol | 工具调用、资源访问、提示词模板 | `MCPServer`、`MCPClient` |
| **A2A** | Agent-to-Agent Protocol | 智能体间通信与技能协作 | `A2AServer`、`A2AClient`、`AgentNetwork` |
| **ANP** | Agent Network Protocol | 网络管理与服务发现 | `ANPNetwork`、`ANPDiscovery`、`ServiceInfo` |

## MCP

```ts
import {MCPServer, MCPClient} from "@agenticforge/protocols";

const server = new MCPServer("weather-server", "提供天气数据");
server.addTool(
  "get_weather",
  "获取城市天气",
  {type: "object", properties: {city: {type: "string"}}, required: ["city"]},
  async ({city}) => `${city} 天气：晴，25°C`,
);

// 内存模式（适合测试）
const client = new MCPClient(server);
await client.connect();
console.log(await client.callTool("get_weather", {city: "北京"}));
client.disconnect();

// HTTP 模式
await server.serve(8000);
const remote = new MCPClient("http://127.0.0.1:8000");
await remote.connect();
```

### MCPServerBuilder — 链式 API

```ts
import {MCPServerBuilder} from "@agenticforge/protocols";

const server = new MCPServerBuilder("my-server")
  .withTool(
    "greet", "问候工具",
    {type: "object", properties: {name: {type: "string"}}, required: ["name"]},
    ({name}) => `你好，${name}！`,
  )
  .withResource("file://readme.txt", "说明文件", "项目说明", () => "欢迎使用！")
  .build();
```

## A2A

```ts
import {A2AServer, A2AClient, AgentNetwork} from "@agenticforge/protocols";

const agent = new A2AServer({
  name: "calculator-agent",
  description: "处理算术任务",
  capabilities: {math: true},
});
agent.addSkill("add", "加法运算", (text) => {
  const [a, b] = text.split("+").map(Number);
  return String(a + b);
});
await agent.serve(5000);

const client = new A2AClient("http://localhost:5000");
const result = await client.executeSkill("add", "3 + 4");
console.log(result.result); // "7"

// 自动发现网络中的 Agent
const network = new AgentNetwork("my-network");
const count = await network.discoverAgents(["http://localhost:5000"]);
console.log(`发现 ${count} 个 Agent`);
```

## ANP

```ts
import {ANPNetwork, ANPDiscovery, ServiceInfo} from "@agenticforge/protocols";

const discovery = new ANPDiscovery();
discovery.registerService(new ServiceInfo({
  serviceId: "calc-1",
  serviceType: "calculator",
  endpoint: "http://localhost:8001",
  capabilities: ["add", "subtract", "multiply"],
  metadata: {region: "cn-north"},
}));
const calculators = discovery.findServicesByType("calculator");
console.log(`找到 ${calculators.length} 个计算服务`);

const network = new ANPNetwork("prod-network");
network.addNode("node1", "http://localhost:8001", {role: "coordinator"});
network.addNode("node2", "http://localhost:8002", {role: "worker"});
network.connectNodes("node1", "node2");
const route = network.routeMessage("node1", "node2");
console.log(route); // ["node1", "node2"]
const status = network.getNetworkStatus();
console.log(status.healthStatus); // "healthy"
```

## 主要导出

### 基础

| 名称 | 说明 |
|------|------|
| `ProtocolType` | 枚举：`MCP`、`A2A`、`ANP` |
| `Protocol` | 所有协议的抽象基类 |

### MCP

| 名称 | 说明 |
|------|------|
| `MCPServer` | 服务器，含工具/资源/提示词注册与内置 HTTP 服务 |
| `MCPServerBuilder` | MCPServer 的链式构建器 |
| `MCPClient` | 支持内存模式和 HTTP 模式的客户端 |
| `createExampleMCPServer` | 工厂函数：含 `calculator` 和 `greet` 工具的示例服务器 |
| `createContext` / `parseContext` | 上下文对象辅助函数 |
| `createSuccessResponse` / `createErrorResponse` | 响应构造辅助函数 |

### A2A

| 名称 | 说明 |
|------|------|
| `A2AServer` | 含技能注册与 HTTP API 的智能体服务器 |
| `A2AClient` | 内存模式或 HTTP 模式的 A2A 客户端 |
| `AgentNetwork` | 管理多个 A2A Agent，支持自动发现 |
| `AgentRegistry` | A2A Agent 中央注册中心 |
| `createExampleA2AServer` | 工厂函数：含 `calculate` 和 `greet` 技能的示例 Agent |

### ANP

| 名称 | 说明 |
|------|------|
| `ServiceInfo` | 服务描述类（id、类型、端点、能力、元数据） |
| `ANPDiscovery` | 服务注册与发现，支持类型/能力/元数据过滤 |
| `ANPNetwork` | 网络拓扑管理：节点、连接、路由、广播 |
| `createExampleANPNetwork` | 工厂函数：创建三节点示例网络 |

## 链接

- [GitHub](https://github.com/LittleBlacky/AgenticFORGE/tree/main/packages/protocols)
- [npm](https://www.npmjs.com/package/@agenticforge/protocols)
- [主项目 README](https://github.com/LittleBlacky/AgenticFORGE)
