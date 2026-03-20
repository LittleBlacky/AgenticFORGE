import React, { useState } from "react";
import { Send, Link, FileText, Zap, BookOpen } from "lucide-react";

interface Props {
  onSend: (text: string) => void;
  onCaptureUrl: (url: string) => void;
  onCaptureText: (text: string) => void;
  onWeeklyReport: () => void;
  loading: boolean;
}

type InputMode = "chat" | "url" | "text";

export default function InputBar({ onSend, onCaptureUrl, onCaptureText, onWeeklyReport, loading }: Props) {
  const [value, setValue] = useState("");
  const [mode, setMode] = useState<InputMode>("chat");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim() || loading) return;
    if (mode === "chat") onSend(value.trim());
    else if (mode === "url") onCaptureUrl(value.trim());
    else if (mode === "text") onCaptureText(value.trim());
    setValue("");
  };

  const placeholder = {
    chat: "问任何问题，或输入指令...",
    url: "输入要捕获的网页 URL...",
    text: "粘贴要存入知识库的文本...",
  }[mode];

  return (
    <div className="input-bar">
      <div className="input-modes">
        {(["chat", "url", "text"] as InputMode[]).map((m) => (
          <button
            key={m}
            className={`mode-btn ${mode === m ? "mode-btn--active" : ""}`}
            onClick={() => setMode(m)}
            type="button"
          >
            {m === "chat" && <Send size={14} />}
            {m === "url" && <Link size={14} />}
            {m === "text" && <FileText size={14} />}
            {m === "chat" ? "对话" : m === "url" ? "捕获URL" : "存入文本"}
          </button>
        ))}
        <button
          className="mode-btn mode-btn--special"
          onClick={onWeeklyReport}
          type="button"
          disabled={loading}
        >
          <Zap size={14} /> 生成周报
        </button>
      </div>
      <form className="input-form" onSubmit={handleSubmit}>
        {mode === "text" ? (
          <textarea
            className="input-field input-field--textarea"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            disabled={loading}
            rows={4}
          />
        ) : (
          <input
            className="input-field"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            disabled={loading}
          />
        )}
        <button className="send-btn" type="submit" disabled={loading || !value.trim()}>
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}
