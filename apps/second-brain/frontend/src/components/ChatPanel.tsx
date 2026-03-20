import React from "react";
import ReactMarkdown from "react-markdown";
import type { Message } from "../hooks/useChat.js";

const AGENT_COLORS: Record<string, string> = {
  capture: "#00d4aa",
  research: "#7c6aff",
  generate: "#ff6b9d",
  plan: "#ffa94d",
  chat: "#74c0fc",
};

const AGENT_LABELS: Record<string, string> = {
  capture: "捕获",
  research: "研究",
  generate: "生成",
  plan: "规划",
  chat: "对话",
};

interface Props {
  messages: Message[];
  loading: boolean;
}

export default function ChatPanel({ messages, loading }: Props) {
  const bottomRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  return (
    <div className="chat-panel">
      {messages.length === 0 && (
        <div className="chat-empty">
          <div className="brain-icon">🧠</div>
          <p>你的第二大脑已就绪，发送 URL 即可捕获知识</p>
          <div className="suggestions">
            {[
              "帮我深度研究一下 RAG 技术",
              "https://example.com/article",
              "帮我生成本周知识库周报",
              "帮我制定学习 Rust 的路线",
            ].map((s) => (
              <span key={s} className="suggestion-chip">{s}</span>
            ))}
          </div>
        </div>
      )}
      {messages.map((msg) => (
        <div key={msg.id} className={`message message--${msg.role}`}>
          {msg.role === "assistant" && msg.skillUsed && (
            <span
              className="agent-badge"
              style={{ background: AGENT_COLORS[msg.skillUsed] ?? "#555" }}
            >
              {AGENT_LABELS[msg.skillUsed] ?? msg.skillUsed}
            </span>
          )}
          <div className="message__content">
            {msg.role === "assistant" ? (
              <ReactMarkdown>{msg.content}</ReactMarkdown>
            ) : (
              <p>{msg.content}</p>
            )}
          </div>
          {msg.agent && (
            <span className="agent-name">{msg.agent}</span>
          )}
        </div>
      ))}
      {loading && (
        <div className="message message--assistant">
          <div className="thinking-dots">
            <span /><span /><span />
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
