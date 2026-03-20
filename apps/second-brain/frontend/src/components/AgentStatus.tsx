import type { WsEvent } from "../hooks/useWebSocket.js";
import { Activity } from "lucide-react";

const TYPE_COLORS = {
  thinking: "#ffa94d",
  done: "#00d4aa",
  error: "#ff6b6b",
  connected: "#74c0fc",
};

const TYPE_LABELS = {
  thinking: "思考中",
  done: "完成",
  error: "错误",
  connected: "已连接",
};

interface Props {
  events: WsEvent[];
  connected: boolean;
}

export default function AgentStatus({ events, connected }: Props) {
  const latest = events[events.length - 1];

  return (
    <div className="agent-status">
      <div className="status-header">
        <Activity size={16} />
        <span>Agent 状态</span>
        <span className={`conn-dot ${connected ? "conn-dot--on" : "conn-dot--off"}`} />
      </div>

      {latest && (
        <div
          className="latest-event"
          style={{ borderColor: TYPE_COLORS[latest.type] }}
        >
          <span
            className="event-type"
            style={{ color: TYPE_COLORS[latest.type] }}
          >
            {TYPE_LABELS[latest.type]}
          </span>
          {latest.agent && <span className="event-agent">{latest.agent}</span>}
          {latest.message && <p className="event-msg">{latest.message}</p>}
        </div>
      )}

      <div className="event-log">
        {[...events].reverse().slice(0, 8).map((ev, i) => (
          <div key={i} className="event-log-item">
            <span style={{ color: TYPE_COLORS[ev.type] }}>●</span>
            <span>{ev.agent ?? ev.type}</span>
            {ev.skillUsed && <span className="skill-tag">{ev.skillUsed}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
