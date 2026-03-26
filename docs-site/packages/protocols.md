# @agenticforge/protocols

[![npm](https://img.shields.io/npm/v/@agenticforge/protocols)](https://www.npmjs.com/package/@agenticforge/protocols)

TypeScript implementations of **MCP**, **A2A**, and **ANP** — the three core agent communication protocols.

## Installation

```bash
npm install @agenticforge/protocols
```

## Protocols

| Protocol | Purpose | Key Classes |
|----------|---------|-------------|
| **MCP** | Tool calls, resource access, prompt templates | `MCPServer`, `MCPClient`, `MCPServerBuilder` |
| **A2A** | Inter-agent skill sharing and communication | `A2AServer`, `A2AClient`, `AgentNetwork` |
| **ANP** | Network management and service discovery | `ANPNetwork`, `ANPDiscovery`, `ServiceInfo` |

## MCP

```ts
import {MCPServer, MCPClient} from "@agenticforge/protocols";

const server = new MCPServer("my-server");
server.addTool(
  "greet",
  "Say hello",
  {type: "object", properties: {name: {type: "string"}}, required: ["name"]},
  ({name}) => `Hello, ${name}!`,
);

// In-memory client
const client = new MCPClient(server);
await client.connect();
console.log(await client.callTool("greet", {name: "World"}));

// HTTP mode
await server.serve(8000);
const remote = new MCPClient("http://127.0.0.1:8000");
await remote.connect();
```

**MCPServer HTTP endpoints:**

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

## A2A

```ts
import {A2AServer, A2AClient, AgentNetwork} from "@agenticforge/protocols";

const agent = new A2AServer({name: "my-agent", description: "Example"});
agent.addSkill("echo", "Echo input", (text) => text);
await agent.serve(5000);

const client = new A2AClient("http://localhost:5000");
const res = await client.executeSkill("echo", "hello");
console.log(res.result); // "hello"

// Auto-discover agents
const network = new AgentNetwork();
await network.discoverAgents(["http://localhost:5000"]);
```

**A2AServer HTTP endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/info` | Agent info |
| `GET` | `/skills` | List skills |
| `POST` | `/execute/:skill` | Run skill (`{ text, data? }`) |
| `POST` | `/ask` | Auto-select skill (`{ question }`) |

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

## API Reference

### Base

| Export | Description |
|--------|-------------|
| `ProtocolType` | Enum: `MCP \| A2A \| ANP` |
| `Protocol` | Abstract base class |

### MCP Exports

| Export | Description |
|--------|-------------|
| `MCPServer` | Server with tool/resource/prompt registration + HTTP |
| `MCPServerBuilder` | Fluent builder for `MCPServer` |
| `MCPClient` | In-memory or HTTP client |
| `createExampleMCPServer()` | Example server factory |
| `createContext()` | Create MCP context object |
| `parseContext()` | Parse MCP context from JSON |
| `createSuccessResponse()` | Build success response |
| `createErrorResponse()` | Build error response |

### A2A Exports

| Export | Description |
|--------|-------------|
| `A2AServer` | Agent server with skill registration + HTTP |
| `A2AClient` | Client for in-memory or HTTP mode |
| `AgentNetwork` | Manage multiple agents with auto-discovery |
| `AgentRegistry` | Central registry for A2A agents |
| `createExampleA2AServer()` | Example agent factory |

### ANP Exports

| Export | Description |
|--------|-------------|
| `ServiceInfo` | Service descriptor class |
| `ANPDiscovery` | Service registry with filtering |
| `ANPNetwork` | Network topology management |
| `createExampleANPNetwork()` | 3-node example network factory |

See the [Protocols Guide](/guide/protocols) for architecture details and examples.
