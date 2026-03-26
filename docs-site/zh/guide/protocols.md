# 协议

AgenticFORGE 提供三种标准智能体通信协议的 TypeScript 实现：**MCP**、**A2A**、**ANP**。

```bash
npm install @agenticforge/protocols
```

## MCP — Model Context Protocol

MCP 将工具、资源、提示词模板以标准接口暴露出去。支持内存模式（零网络开销，适合测试）和 HTTP 模式。

```ts
import {MCPServer, MCPClient} from "@agenticforge/protocols";

const server = new MCPServer("my-server", "示例 MCP 服务器");

server.addTool(
  "get_weather",
  "获取城市天气",
  {
    type: "object",
    properties: {city: {type: "string", description: "城市名称"}},
    required: ["city"],
  },
  async ({city}) => `${city} 天气：晴，25°C`,
);

// 内存模式客户端
const client = new MCPClient(server);
await client.connect();

const tools = await client.listTools();
console.log(tools.map(t => t.name)); // ["get_weather"]

const result = await client.callTool("get_weather", {city: "北京"});
console.log(result); // "北京 天气：晴，25°C"

client.disconnect();
```

### HTTP 模式

```ts
await server.serve(8000);

const remote = new MCPClient("http://127.0.0.1:8000");
await remote.connect();
```

### MCPServerBuilder

链式构建器 API：

```ts
import {MCPServerBuilder} from "@agenticforge/protocols";

const server = new MCPServerBuilder("my-server")
  .withTool(
    "greet", "问候工具",
    {type: "object", properties: {name: {type: "string"}}, required: ["name"]},
    ({name}) => `你好，${name}！`,
  )
  .withResource("file://config.json", "配置", "应用配置", () => `{"version":"1.0"}`)
  .build();
```

### MCP HTTP 端点

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

---

## A2A — Agent-to-Agent Protocol

A2A 让 Agent 通过 HTTP 或内存模式相互调用技能。

```ts
import {A2AServer, A2AClient, AgentNetwork} from "@agenticforge/protocols";

const agent = new A2AServer({
  name: "calculator-agent",
  description: "处理算术任务",
  capabilities: {math: true},
});

agent.addSkill("add", "从文本中提取并相加两个数字", (text) => {
  const [a, b] = text.split("+").map(Number);
  return String(a + b);
});

await agent.serve(5000);

const client = new A2AClient("http://localhost:5000");
const res = await client.executeSkill("add", "3 + 4");
console.log(res.result); // "7"

// 自动发现集群中的 Agent
const network = new AgentNetwork("my-cluster");
await network.discoverAgents(["http://localhost:5000", "http://localhost:5001"]);
```

### A2A HTTP 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/health` | 健康检查 |
| `GET` | `/info` | Agent 信息与技能列表 |
| `GET` | `/skills` | 技能列表 |
| `POST` | `/execute/:skill` | 执行技能（`{ text, data? }`） |
| `POST` | `/ask` | 自动选择技能（`{ question }`） |

---

## ANP — Agent Network Protocol

ANP 为大规模 Agent 部署提供服务发现与网络拓扑管理。

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

// 按类型查找
const calcs = discovery.findServicesByType("calculator");

// 按能力查找
const adders = discovery.findServicesByCapability("add");

// 网络拓扑
const network = new ANPNetwork("prod");
network.addNode("n1", "http://localhost:8001", {role: "coordinator"});
network.addNode("n2", "http://localhost:8002", {role: "worker"});
network.connectNodes("n1", "n2");

const route = network.routeMessage("n1", "n2", {type: "task"});
console.log(route); // ["n1", "n2"]

const status = network.getNetworkStatus();
console.log(status.healthStatus); // "healthy"
console.log(status.nodeCount);    // 2
```

---

## 协议选型参考

| 场景 | 推荐协议 |
|------|----------|
| LLM 工具 / 资源 / 提示词暴露 | MCP |
| Agent 间技能互调 | A2A |
| 大规模网络管理与服务发现 | ANP |
| 无网络的本地测试 | MCP 或 A2A 内存模式 |

---

## API 参考

详见 [@agenticforge/protocols](/zh/packages/protocols) 包页面。
