# Protocols

AgenticFORGE provides TypeScript implementations of three standard agent communication protocols: **MCP**, **A2A**, and **ANP**.

```bash
npm install @agenticforge/protocols
```

## MCP — Model Context Protocol

MCP lets you expose tools, resources, and prompt templates over a standard interface. It supports both in-memory mode (zero network overhead, ideal for testing) and HTTP mode.

```ts
import {MCPServer, MCPClient} from "@agenticforge/protocols";

// Create a server and register a tool
const server = new MCPServer("my-server", "Example MCP server");

server.addTool(
  "get_weather",
  "Get current weather for a city",
  {
    type: "object",
    properties: {city: {type: "string", description: "City name"}},
    required: ["city"],
  },
  async ({city}) => `Weather in ${city}: sunny, 25°C`,
);

// In-memory client — no network needed
const client = new MCPClient(server);
await client.connect();

const tools = await client.listTools();
console.log(tools.map(t => t.name)); // ["get_weather"]

const result = await client.callTool("get_weather", {city: "Tokyo"});
console.log(result); // "Weather in Tokyo: sunny, 25°C"

client.disconnect();
```

### HTTP mode

```ts
// Start as HTTP server
await server.serve(8000);

// Connect from anywhere
const remote = new MCPClient("http://127.0.0.1:8000");
await remote.connect();
```

### MCPServerBuilder

Fluent API for building servers:

```ts
import {MCPServerBuilder} from "@agenticforge/protocols";

const server = new MCPServerBuilder("my-server")
  .withTool(
    "greet", "Say hello",
    {type: "object", properties: {name: {type: "string"}}, required: ["name"]},
    ({name}) => `Hello, ${name}!`,
  )
  .withResource("file://config.json", "Config", "App config", () => `{"version":"1.0"}`)
  .build();
```

### MCP HTTP Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/info` | Server info |
| `GET` | `/tools` | List tools |
| `POST` | `/tools/:name` | Call tool (`{ arguments: {...} }`) |
| `GET` | `/resources` | List resources |
| `GET` | `/resources/*` | Read resource |
| `GET` | `/prompts` | List prompts |
| `POST` | `/prompts/:name` | Get prompt (`{ arguments: {...} }`) |

---

## A2A — Agent-to-Agent Protocol

A2A enables agents to expose **skills** and call each other's skills over HTTP or in-memory.

```ts
import {A2AServer, A2AClient, AgentNetwork} from "@agenticforge/protocols";

// Build an agent with skills
const agent = new A2AServer({
  name: "calculator-agent",
  description: "Handles arithmetic tasks",
  capabilities: {math: true},
});

agent.addSkill("add", "Add two numbers from text", (text) => {
  const [a, b] = text.split("+").map(Number);
  return String(a + b);
});

await agent.serve(5000);

// Call from another agent
const client = new A2AClient("http://localhost:5000");
const res = await client.executeSkill("add", "3 + 4");
console.log(res.result); // "7"

// Auto-discover all agents in a cluster
const network = new AgentNetwork("my-cluster");
await network.discoverAgents(["http://localhost:5000", "http://localhost:5001"]);
```

### A2A HTTP Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/info` | Agent info + skill list |
| `GET` | `/skills` | List skills |
| `POST` | `/execute/:skill` | Run skill (`{ text, data? }`) |
| `POST` | `/ask` | Auto-select skill (`{ question }`) |

---

## ANP — Agent Network Protocol

ANP provides service discovery and network topology management for large-scale agent deployments.

```ts
import {ANPNetwork, ANPDiscovery, ServiceInfo} from "@agenticforge/protocols";

// Service registry
const discovery = new ANPDiscovery();

discovery.registerService(new ServiceInfo({
  serviceId: "calc-1",
  serviceType: "calculator",
  endpoint: "http://localhost:8001",
  capabilities: ["add", "subtract", "multiply"],
  metadata: {region: "us-east"},
}));

// Find by type
const calcs = discovery.findServicesByType("calculator");

// Find by capability
const adders = discovery.findServicesByCapability("add");

// Network topology
const network = new ANPNetwork("prod");
network.addNode("n1", "http://localhost:8001", {role: "coordinator"});
network.addNode("n2", "http://localhost:8002", {role: "worker"});
network.connectNodes("n1", "n2");

const route = network.routeMessage("n1", "n2", {type: "task"});
console.log(route); // ["n1", "n2"]

const status = network.getNetworkStatus();
console.log(status.healthStatus); // "healthy"
console.log(status.nodeCount);    // 2
console.log(status.edgeCount);    // 1
```

---

## Choosing a Protocol

| Scenario | Recommended Protocol |
|----------|---------------------|
| LLM tool / resource / prompt exposure | MCP |
| Agent-to-agent skill calls | A2A |
| Large-scale network management and service discovery | ANP |
| Testing without a network | MCP or A2A in-memory mode |

---

## API Reference

See the [@agenticforge/protocols](/packages/protocols) package page for the full API reference.
