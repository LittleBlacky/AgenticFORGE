import { useEffect, useRef, useState } from "react";

export interface WsEvent {
  type: "thinking" | "done" | "error" | "connected";
  message?: string;
  agent?: string;
  skillUsed?: string;
}

export function useWebSocket() {
  const [events, setEvents] = useState<WsEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket(`ws://${location.host}`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as WsEvent;
        setEvents((prev) => [...prev.slice(-50), data]);
      } catch {}
    };

    return () => ws.close();
  }, []);

  const latestEvent = events[events.length - 1];
  return { events, connected, latestEvent };
}
