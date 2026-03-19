import { A2AServer, MCPServer, ANPNetwork, ANPDiscovery, ServiceInfo } from "@agenticforge/protocols";
import registry from "../tools/index.js";

// ── ANP Network ───────────────────────────────────────────
export const network = new ANPNetwork("second-brain-network");
export const discovery = new ANPDiscovery();

export function initANP() {
  network.addAgent("gateway",    "http://localhost:3001", { role: "orchestrator" });
  network.addAgent("capture",    "http://localhost:3002", { role: "worker", type: "capture" });
  network.addAgent("researcher", "http://localhost:3003", { role: "worker", type: "research" });
  network.addAgent("generator",  "http://localhost:3004", { role: "worker", type: "generate" });
  network.addAgent("planner",    "http://localhost:3005", { role: "worker", type: "plan" });
  network.connectNodes("gateway", "capture");
  network.connectNodes("gateway", "researcher");
  network.connectNodes("gateway", "generator");
  network.connectNodes("gateway", "planner");
  discovery.registerService(new ServiceInfo({ serviceId: "capture-agent",   serviceType: "agent", endpoint: "http://localhost:3002", serviceName: "Knowledge Capture Agent",   capabilities: ["capture", "ingest"] }));
  discovery.registerService(new ServiceInfo({ serviceId: "research-agent",   serviceType: "agent", endpoint: "http://localhost:3003", serviceName: "Deep Research Agent",       capabilities: ["search", "rag"] }));
  discovery.registerService(new ServiceInfo({ serviceId: "generator-agent",  serviceType: "agent", endpoint: "http://localhost:3004", serviceName: "Insight Generator Agent",   capabilities: ["summarize", "report"] }));
  discovery.registerService(new ServiceInfo({ serviceId: "planner-agent",    serviceType: "agent", endpoint: "http://localhost:3005", serviceName: "Task Planner Agent",        capabilities: ["plan", "decompose"] }));
  const stats = network.getNetworkStats();
  console.log(`[ANP] Network ready: ${stats.totalNodes} nodes, ${stats.totalConnections} connections`);
  return { network, discovery };
}

// ── A2A Server ────────────────────────────────────────────
let captureA2AServer: A2AServer | null = null;
let researchA2AServer: A2AServer | null = null;

export async function startA2AServers() {
  captureA2AServer = new A2AServer({ name: "capture-agent", description: "Knowledge capture specialist" });
  captureA2AServer.addSkill("capture", "Capture and ingest knowledge from URL or text", async (text) => text);

  researchA2AServer = new A2AServer({ name: "research-agent", description: "Deep research specialist" });
  researchA2AServer.addSkill("research", "Deep research on any topic", async (text) => text);

  console.log("[A2A] Servers configured");
  return { captureA2AServer, researchA2AServer };
}

// ── MCP Server ────────────────────────────────────────────
let mcpServer: MCPServer | null = null;

export async function startMCPServer() {
  mcpServer = new MCPServer("second-brain", "Second Brain knowledge base tools");
  const tools = (registry as any).getAll?.() ?? [];
  for (const tool of tools) {
    mcpServer.addTool(tool.name, tool.description ?? "", {}, async (args: Record<string, unknown>) => {
      return await (registry as any).execute(tool.name, args);
    });
  }
  console.log("[MCP] Second Brain MCP server configured");
  return mcpServer;
}

export async function stopAll() {
  console.log("[Protocols] Stopping all servers");
}