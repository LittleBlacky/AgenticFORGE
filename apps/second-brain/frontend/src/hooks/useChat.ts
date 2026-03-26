import { useState, useCallback, useRef } from "react";
import { chatStream, ingestUrl, ingestText, generateWeeklyReport } from "../api/index.js";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  agent?: string;
  skillUsed?: string;
  timestamp: Date;
  streaming?: boolean; // true = 正在流式输出中
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const abortRef                = useRef<AbortController | null>(null);

  const send = useCallback(async (text: string) => {
    // 取消上一次未完成的请求
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setError(null);

    // 插入用户消息
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);

    // 预插入空的助手消息气泡（streaming: true）
    const assistantId = crypto.randomUUID();
    const assistantMsg: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
      streaming: true,
    };
    setMessages((prev) => [...prev, assistantMsg]);

    try {
      for await (const chunk of chatStream(text, ctrl.signal)) {
        if (chunk.type === "token") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: m.content + chunk.token }
                : m,
            ),
          );
        } else if (chunk.type === "meta") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, agent: chunk.agent, skillUsed: chunk.skillUsed, streaming: false }
                : m,
            ),
          );
        } else if (chunk.type === "done") {
          // 确保 streaming 标记关闭
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, streaming: false } : m,
            ),
          );
        } else if (chunk.type === "error") {
          setError(chunk.message);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: `⚠️ ${chunk.message}`, streaming: false }
                : m,
            ),
          );
        }
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: `⚠️ ${msg}`, streaming: false }
            : m,
        ),
      );
    } finally {
      setLoading(false);
      // 确保气泡不卡在 streaming 状态
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId && m.streaming ? { ...m, streaming: false } : m,
        ),
      );
    }
  }, []);

  const captureUrl = useCallback(async (url: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await ingestUrl(url);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: res.output,
          agent: "WorkflowAgent",
          skillUsed: "capture",
          timestamp: new Date(),
        },
      ]);
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
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `已成功将内容（${content.length} 字）存入知识库。`,
          agent: "RAGPipeline",
          skillUsed: "capture",
          timestamp: new Date(),
        },
      ]);
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
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: res.report,
          agent: "ReflectionAgent",
          skillUsed: "generate",
          timestamp: new Date(),
        },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  return { messages, loading, error, send, captureUrl, captureText, weeklyReport };
}
