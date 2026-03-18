---
name: agenticforge-protocols
description: Expert at setting up AgenticFORGE multi-agent protocols — A2A (Agent-to-Agent) and MCP (Model Context Protocol). Use when the user wants agents to communicate, delegate tasks, expose tools via MCP, or build multi-agent pipelines.
triggerHint: When the user asks about multi-agent systems, A2A, MCP, agent delegation, connecting agents, or exposing agents as services.
---

# AgenticFORGE Protocols Expert

## Role
You are an expert in `@agenticforge/protocols`. You design multi-agent architectures using A2A and MCP.

## Protocol Selection

| Need | Protocol |
|---|---|
| Agent delegates task to another agent | A2A |
| Expose agent tools to Claude Desktop / Cursor | MCP Server |
| Agent consumes external MCP tools | MCP Client |

## A2A — Agent-to-Agent

### Server (specialist)
```typescript
import { A2AServer } from "@agenticforge/protocols";
import { FunctionCallAgent, LLMClient } from "@agenticforge/kit";

const agent = new FunctionCallAgent({
  llm: new LLMClient({ provider: "openai", model: "gpt-4o" }),
  tools: [searchTool],
  systemPrompt: "You are a research specialist.",
});

const server = new A2AServer({ agent, port: 3001 });
await server.start();
```

### Client (orchestrator)
```typescript
import { A2AClient } from "@agenticforge/protocols";

const client = new A2AClient({ url: "http://localhost:3001" });
const result = await client.run("Research vector databases");
```

### Wrap client as a Tool (use inside agent)
```typescript
import { Tool, toolAction } from "@agenticforge/tools";
import { A2AClient } from "@agenticforge/protocols";
import { z } from "zod";

const researchTool = new Tool({
  name: "research-agent",
  description: "Delegate deep research to the specialist agent",
  parameters: [{ name: "task", type: "string", required: true }],
  action: toolAction(
    z.object({ task: z.string() }),
    async ({ task }) => {
      const c = new A2AClient({ url: "http://localhost:3001" });
      return await c.run(task);
    }
  ),
});
```

## MCP — Model Context Protocol

### MCP Server
```typescript
import { MCPServer } from "@agenticforge/protocols";

const server = new MCPServer({
  name: "my-tools",
  version: "1.0.0",
  tools: [weatherTool, stockTool],
  port: 3002,
});
await server.start();
```

### MCP Client
```typescript
import { MCPClient } from "@agenticforge/protocols";

const client = new MCPClient({ url: "http://localhost:3002" });
await client.connect();
const tools = await client.listTools();
const result = await client.callTool("get-weather", { city: "Tokyo" });
```

## Gotchas

- A2A server must be running before client connects — add retry/health-check in production
- Wrap A2AClient as a Tool to use it inside FunctionCallAgent
- MCPServer exposes tools, not agents — LLM reasoning stays on the client side
- Use different ports for each server (3001, 3002, ...)

## Output Format

1. Show server + client as a pair
2. Explain orchestrator vs specialist roles
3. Show client-as-Tool pattern when used inside an agent