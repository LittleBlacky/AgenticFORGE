import "reflect-metadata";
import "dotenv/config";
import express from "express";
import cors from "cors";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import { initGateway, route } from "./gateway/index.js";
import { initANP } from "./protocols/index.js";
import { memoryManager, semanticMemory, episodicMemory, vectorStore, graphStore, shutdownMemory } from "./memory/index.js";
import { generateWeeklyInsight } from "./agents/generator.js";
import { captureWorkflowAgent, capturePipelineDefinition } from "./agents/capture.js";
import { parallelExecutor } from "./tools/index.js";
import { randomUUID } from "node:crypto";

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());

function broadcast(data: unknown) {
  const msg = JSON.stringify(data);
  wss.clients.forEach((c) => { if (c.readyState === WebSocket.OPEN) c.send(msg); });
}

wss.on("connection", (ws) => {
  console.log("[WS] Client connected");
  ws.send(JSON.stringify({ type: "connected", message: "Second Brain ready" }));
});

app.post("/api/chat", async (req, res) => {
  const { message } = req.body as { message: string };
  if (!message) return res.status(400).json({ error: "message is required" });
  broadcast({ type: "thinking", message: "Analyzing intent...", agent: "Gateway" });
  try {
    const result = await route(message);
    broadcast({ type: "done", agent: result.agent, skillUsed: result.skillUsed });
    return res.json({ output: result.output, agent: result.agent, skillUsed: result.skillUsed });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    broadcast({ type: "error", message: msg });
    return res.status(500).json({ error: msg });
  }
});

app.post("/api/ingest/url", async (req, res) => {
  const { url } = req.body as { url: string };
  if (!url) return res.status(400).json({ error: "url is required" });
  broadcast({ type: "thinking", message: `Capturing: ${url}`, agent: "CaptureWorkflow" });
  try {
    const result = await captureWorkflowAgent.runWorkflow(capturePipelineDefinition, url);
    broadcast({ type: "done", agent: "WorkflowAgent", skillUsed: "capture" });
    return res.json({ output: result.output });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

app.post("/api/ingest/text", async (req, res) => {
  const { content, source } = req.body as { content: string; source?: string };
  if (!content) return res.status(400).json({ error: "content is required" });
  try {
    await semanticMemory.add({ id: randomUUID(), content, memoryType: "semantic", userId: "default", timestamp: new Date(), importance: 0.8, metadata: { source: source ?? "manual" } });
    return res.json({ success: true, chars: content.length });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

app.get("/api/search", async (req, res) => {
  const { q, topK } = req.query as { q: string; topK?: string };
  if (!q) return res.status(400).json({ error: "q is required" });
  try {
    const results = await semanticMemory.retrieve(q, parseInt(topK ?? "5"));
    return res.json({ results });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

app.post("/api/insight/weekly", async (_req, res) => {
  broadcast({ type: "thinking", message: "Generating weekly insight...", agent: "GeneratorAgent" });
  try {
    const report = await generateWeeklyInsight();
    broadcast({ type: "done", agent: "ReflectionAgent", skillUsed: "generate" });
    return res.json({ report });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

app.get("/api/search/parallel", async (req, res) => {
  const { q } = req.query as { q: string };
  if (!q) return res.status(400).json({ error: "q is required" });
  try {
    const requests = [{ id: "r1", toolName: "search", parameters: { input: q } }, { id: "r2", toolName: "rag", parameters: { input: q } }];
    const results = await parallelExecutor.executeBatch(requests);
    return res.json({ results });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

app.get("/api/memory/stats", async (_req, res) => {
  try {
    const stats = await memoryManager.getMemoryStats();
    return res.json(stats);
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

app.get("/api/health", async (_req, res) => {
  const qdrantOk = "health" in vectorStore
    ? await (vectorStore as { health(): Promise<boolean> }).health().catch(() => false)
    : true;
  const neo4jOk = graphStore
    ? await graphStore.health().catch(() => false)
    : null;
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    adapters: {
      vectorStore: qdrantOk ? "healthy" : "unreachable",
      graphStore: neo4jOk === null ? "disabled" : neo4jOk ? "healthy" : "unreachable",
    },
  });
});

async function main() {
  console.log("Starting Second Brain...");
  await initGateway();
  initANP();

  // ── 适配器健康检查 ──────────────────────────────────────────────────────────
  const qdrantOk = "health" in vectorStore
    ? await (vectorStore as { health(): Promise<boolean> }).health().catch(() => false)
    : true;
  console.log(`[Startup] Qdrant: ${qdrantOk ? "✓ connected" : "✗ unreachable (fallback: in-memory)"}`);

  if (graphStore) {
    const neo4jOk = await graphStore.health().catch(() => false);
    console.log(`[Startup] Neo4j:  ${neo4jOk ? "✓ connected" : "✗ unreachable"}`);
  } else {
    console.log("[Startup] Neo4j:  disabled (NEO4J_URI not set)");
  }

  const PORT = process.env["PORT"] ?? 3010;
  server.listen(PORT, () => {
    console.log(`Second Brain API: http://localhost:${PORT}`);
    console.log(`WebSocket: ws://localhost:${PORT}`);
  });
}

// ── 优雅关闭 ────────────────────────────────────────────────────────────────
async function shutdown(signal: string) {
  console.log(`\n[Shutdown] Received ${signal}`);
  server.close(() => console.log("[Shutdown] HTTP server closed"));
  await shutdownMemory();
  process.exit(0);
}
process.on("SIGINT",  () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

main().catch(console.error);