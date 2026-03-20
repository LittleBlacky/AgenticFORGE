import { useState, useCallback } from "react";
import { chat, ingestUrl, ingestText, generateWeeklyReport } from "../api/index.js";
import type { ChatResponse } from "../api/index.js";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  agent?: string;
  skillUsed?: string;
  timestamp: Date;
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(async (text: string) => {
    setLoading(true);
    setError(null);
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const res: ChatResponse = await chat(text);
      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: res.output,
        agent: res.agent,
        skillUsed: res.skillUsed,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const captureUrl = useCallback(async (url: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await ingestUrl(url);
      const msg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: res.output,
        agent: "WorkflowAgent",
        skillUsed: "capture",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, msg]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const captureText = useCallback(async (content: string, source?: string) => {
    setLoading(true);
    setError(null);
    try {
      await ingestText(content, source);
      const msg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `已成功将内容（${content.length} 字）存入知识库。`,
        agent: "RAGPipeline",
        skillUsed: "capture",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, msg]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const weeklyReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await generateWeeklyReport();
      const msg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: res.report,
        agent: "ReflectionAgent",
        skillUsed: "generate",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, msg]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  return { messages, loading, error, send, captureUrl, captureText, weeklyReport };
}
