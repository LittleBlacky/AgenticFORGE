import "reflect-metadata";
import "dotenv/config";
import express from "express";
import cors from "cors";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import { initGateway, route } from "./gateway/index.js";
import { initANP } from "./protocols/index.js";
import { ragPipeline, memoryManager, episodicMemory } from "./memory/index.js";
import { generateWeeklyInsight } from "./agents/generator.js";
import { captureWorkflowAgent, capturePipelineDefinition } from "./agents/capture.js";
import { parallelExecutor } from "./tools/index.js";

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
    await ragPipeline.ingest([{ content, metadata: { source: source ?? "manual", timestamp: new Date().toISOString() } }]);
    return res.json({ success: true, chars: content.length });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

app.get("/api/search", async (req, res) => {
  const { q, topK } = req.query as { q: string; topK?: string };
  if (!q) return res.status(400).json({ error: "q is required" });
  try {
    const results = await ragPipeline.retrieve(q, { topK: parseInt(topK ?? "5") });
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
    const results = await parallelExecutor.runAll({ input: q });
    return res.json({ results });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

app.get("/api/memory/stats", async (_req, res) => {
  try {
    const stats = await memoryManager.getStats();
    return res.json(stats);
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

async function main() {
  console.log("Starting Second Brain...");
  await initGateway();
  initANP();
  const PORT = process.env.PORT ?? 3005;
  server.listen(PORT, () => {
    console.log(`Second Brain API: http://localhost:${PORT}`);
    console.log(`WebSocket: ws://localhost:${PORT}`);
  });
}

main().catch(console.error);