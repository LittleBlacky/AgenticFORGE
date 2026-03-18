# @agenticforge/protocols

[![npm](https://img.shields.io/npm/v/@agenticforge/protocols)](https://www.npmjs.com/package/@agenticforge/protocols)

**MCP**、**A2A**、**ANP** 三大核心智能体通信协议的 TypeScript 实现。

## 安装

```bash
npm install @agenticforge/protocols
```

## 协议概览

| 协议 | 用途 | 核心类 |
|------|------|--------|
| **MCP** | 工具调用、资源访问、提示词模板 | `MCPServer`、`MCPClient`、`MCPServerBuilder` |
| **A2A** | 智能体间技能共享与通信 | `A2AServer`、`A2AClient`、`AgentNetwork` |
| **ANP** | 网络管理与服务发现 | `ANPNetwork`、`ANPDiscovery`、`ServiceInfo` |

## MCP

```ts
import {MCPServer, MCPClient} from "@agenticforge/protocols";

const server = new MCPServer("my-server");
server.addTool(
  "greet",
  "问候工具",
  {type: "object", properties: {name: {type: "string"}}, required: ["name"]},
  ({name}) => `你好，${name}！`,
);

// 内存模式客户端
const client = new MCPClient(server);
await client.connect();
console.log(await client.callTool("greet", {name: "世界"}));

// HTTP 模式
await server.serve(8000);
const remote = new MCPClient("http://127.0.0.1:8000");
await remote.connect();
```

**MCPServer HTTP 端点：**

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/health` | 健康检查 |
| `GET` | `/info` | 服务器信息 |
| `GET` | `/tools` | 工具列表 |
| `POST` | `/tools/:name` | 调用工具（`{ arguments: {...} }`） |
| `GET` | `/resources` | 资源列表 |
| `GET` | `/resources/*` | 读取资源 |
| `GET` | `/prompts` | 提示词列表 |
| `POST` | `/prompts/:name` | 获取提示词（`{ arguments: {...} }`） |

## A2A

```ts
import {A2AServer, A2AClient, AgentNetwork} from "@agenticforge/protocols";

const agent = new A2AServer({name: "my-agent", description: "示例 Agent"});
agent.addSkill("echo", "回显输入", (text) => text);
await agent.serve(5000);

const client = new A2AClient("http://localhost:5000");
const res = await client.executeSkill("echo", "hello");
console.log(res.result); // "hello"

// 自动发现 Agent
const network = new AgentNetwork();
await network.discoverAgents(["http://localhost:5000"]);
```

**A2AServer HTTP 端点：**

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/health` | 健康检查 |
| `GET` | `/info` | Agent 信息 |
| `GET` | `/skills` | 技能列表 |
| `POST` | `/execute/:skill` | 执行技能（`{ text, data? }`） |
| `POST` | `/ask` | 自动选择技能（`{ question }`） |

## ANP

```ts
import {ANPNetwork, ANPDiscovery, ServiceInfo} from "@agenticforge/protocols";

const discovery = new ANPDiscovery();
discovery.registerService(new ServiceInfo({
  serviceId: "svc-1",
  serviceType: "calculator",
  endpoint: "http://localhost:8001",
  capabilities: ["add", "multiply"],
}));
const svcs = discovery.findServicesByType("calculator");

const network = new ANPNetwork("prod");
network.addNode("n1", "http://localhost:8001");
network.addNode("n2", "http://localhost:8002");
network.connectNodes("n1", "n2");
const route = network.routeMessage("n1", "n2");
const status = network.getNetworkStatus(); // { healthStatus: "healthy", ... }
```

## API 参考

### 基础

| 导出 | 说明 |
|------|------|
| `ProtocolType` | 枚举：`MCP \| A2A \| ANP` |
| `Protocol` | 所有协议的抽象基类 |

### MCP 导出

| 导出 | 说明 |
|------|------|
| `MCPServer` | 服务器，含工具/资源/提示词注册与内置 HTTP |
| `MCPServerBuilder` | MCPServer 的链式构建器 |
| `MCPClient` | 内存模式或 HTTP 模式客户端 |
| `createExampleMCPServer()` | 示例服务器工厂函数 |
| `createContext()` | 创建 MCP 上下文对象 |
| `parseContext()` | 解析 JSON 上下文 |
| `createSuccessResponse()` | 构造成功响应 |
| `createErrorResponse()` | 构造错误响应 |

### A2A 导出

| 导出 | 说明 |
|------|------|
| `A2AServer` | 含技能注册与 HTTP API 的 Agent 服务器 |
| `A2AClient` | 内存模式或 HTTP 模式客户端 |
| `AgentNetwork` | 多 Agent 管理，支持自动发现 |
| `AgentRegistry` | A2A Agent 中央注册中心 |
| `createExampleA2AServer()` | 示例 Agent 工厂函数 |

### ANP 导出

| 导出 | 说明 |
|------|------|
| `ServiceInfo` | 服务描述类 |
| `ANPDiscovery` | 支持过滤的服务注册与发现 |
| `ANPNetwork` | 网络拓扑管理 |
| `createExampleANPNetwork()` | 三节点示例网络工厂函数 |

详见 [协议指南](/zh/guide/protocols)。
