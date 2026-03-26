# @agenticforge/protocols

[![npm](https://img.shields.io/npm/v/@agenticforge/protocols)](https://www.npmjs.com/package/@agenticforge/protocols)
[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)


<p><a href="./README.zh_CN.md">中文</a> | <strong>English</strong></p>

Typescript implementations of the three core agent communication protocols for AgenticFORGE:
**MCP** (Model Context Protocol), **A2A** (Agent-to-Agent Protocol), and **ANP** (Agent Network Protocol).

## Installation

```bash
npm install @agenticforge/protocols
```

## Protocol Overview

| Protocol | Full Name | Main Use | Key Classes |
|----------|-----------|----------|-------------|
| **MCP** | Model Context Protocol | Tool calls, resource access, prompt templates | `MCPServer`, `MCPClient` |
| **A2A** | Agent-to-Agent Protocol | Inter-agent communication and skill sharing | `A2AServer`, `A2AClient`, `AgentNetwork` |
| **ANP** | Agent Network Protocol | Network management and service discovery | `ANPNetwork`, `ANPDiscovery`, `ServiceInfo` |

## MCP — Model Context Protocol

Expose tools, resources, and prompt templates over a standard protocol. Supports in-memory mode (zero network overhead) and HTTP mode.

```ts
import {MCPServer, MCPClient} from "@agenticforge/protocols";

// Build a server
const server = new MCPServer("weather-server", "Provides weather data");

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

server.addResource(
  "file://config.json",
  "App Config",
  "Application configuration",
  () => JSON.stringify({version: "1.0"}),
  "application/json",
);

// In-memory client (no network, great for testing)
const client = new MCPClient(server);
await client.connect();

const tools = await client.listTools();
const result = await client.callTool("get_weather", {city: "Beijing"});
console.log(result); // "Weather in Beijing: sunny, 25°C"

client.disconnect();

// HTTP mode — start server and connect remotely
await server.serve(8000);
const httpClient = new MCPClient("http://127.0.0.1:8000");
await httpClient.connect();
```

### MCPServerBuilder — fluent API

```ts
import {MCPServerBuilder} from "@agenticforge/protocols";

const server = new MCPServerBuilder("my-server")
  .withTool("greet", "Say hello", {type: "object", properties: {name: {type: "string"}}, required: ["name"]},
    ({name}) => `Hello, ${name}!`)
  .withResource("file://readme.txt", "README", "Project readme", () => "Welcome!")
  .build();
```

## A2A — Agent-to-Agent Protocol

Register skills on an agent and let other agents invoke them via HTTP or in-memory calls.

```ts
import {A2AServer, A2AClient, AgentNetwork} from "@agenticforge/protocols";

// Create an agent with skills
const agent = new A2AServer({
  name: "calculator-agent",
  description: "Handles arithmetic tasks",
  capabilities: {math: true},
});

agent.addSkill("add", "Add two numbers", (text) => {
  const [a, b] = text.split("+").map(Number);
  return String(a + b);
});

// Start HTTP server
await agent.serve(5000);

// Connect with client
const client = new A2AClient("http://localhost:5000");
const result = await client.executeSkill("add", "3 + 4");
console.log(result.result); // "7"

// Auto-discover agents in a network
const network = new AgentNetwork("my-network");
const count = await network.discoverAgents(["http://localhost:5000"]);
console.log(`Discovered ${count} agents`);
```

## ANP — Agent Network Protocol

Manage large-scale agent networks with service discovery, routing, and broadcasting.

```ts
import {ANPNetwork, ANPDiscovery, ServiceInfo} from "@agenticforge/protocols";

// Service discovery
const discovery = new ANPDiscovery();

discovery.registerService(new ServiceInfo({
  serviceId: "calc-1",
  serviceType: "calculator",
  endpoint: "http://localhost:8001",
  capabilities: ["add", "subtract", "multiply"],
  metadata: {region: "us-east"},
}));

const calculators = discovery.findServicesByType("calculator");
console.log(`Found ${calculators.length} calculator service(s)`);

// Network topology
const network = new ANPNetwork("prod-network");
network.addNode("node1", "http://localhost:8001", {role: "coordinator"});
network.addNode("node2", "http://localhost:8002", {role: "worker"});
network.connectNodes("node1", "node2");

const route = network.routeMessage("node1", "node2", {type: "task", payload: "hello"});
console.log(route); // ["node1", "node2"]

const status = network.getNetworkStatus();
console.log(status.healthStatus); // "healthy"
```

## Exports

### Base
| Name | Description |
|------|-------------|
| `ProtocolType` | Enum: `MCP`, `A2A`, `ANP` |
| `Protocol` | Abstract base class for all protocols |

### MCP
| Name | Description |
|------|-------------|
| `MCPServer` | MCP server with tool/resource/prompt registration and built-in HTTP |
| `MCPServerBuilder` | Fluent builder API for `MCPServer` |
| `MCPClient` | Client supporting in-memory and HTTP transport |
| `createExampleMCPServer` | Factory: creates an example server with `calculator` and `greet` tools |
| `createContext` / `parseContext` | Context object helpers |
| `createSuccessResponse` / `createErrorResponse` | Response helpers |

### A2A
| Name | Description |
|------|-------------|
| `A2AServer` | A2A agent server with skill registration and HTTP API |
| `A2AClient` | Client for in-memory or HTTP communication with an A2A agent |
| `AgentNetwork` | Manages a collection of A2A agents with auto-discovery |
| `AgentRegistry` | Central registry for A2A agents |
| `createExampleA2AServer` | Factory: creates an example agent with `calculate` and `greet` skills |

### ANP
| Name | Description |
|------|-------------|
| `ServiceInfo` | Service descriptor (id, type, endpoint, capabilities, metadata) |
| `ANPDiscovery` | Service registry with type/capability/metadata filtering |
| `ANPNetwork` | Network topology: nodes, connections, routing, broadcasting |
| `createExampleANPNetwork` | Factory: creates a 3-node example network |

## Links

- [GitHub](https://github.com/LittleBlacky/AgenticFORGE/tree/main/packages/protocols)
- [npm](https://www.npmjs.com/package/@agenticforge/protocols)
- [Root README](https://github.com/LittleBlacky/AgenticFORGE)

## Acknowledgements

This package is part of AgenticFORGE, which builds upon [Hello-Agents](https://github.com/datawhalechina/Hello-Agents) (CC BY-NC-SA 4.0). The MCP / A2A / ANP TypeScript implementations were authored by [LittleBlacky](https://github.com/LittleBlacky).
