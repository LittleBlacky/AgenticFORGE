import { useState } from "react";
import ChatPanel from "./components/ChatPanel.js";
import InputBar from "./components/InputBar.js";
import SearchPanel from "./components/SearchPanel.js";
import AgentStatus from "./components/AgentStatus.js";
import KnowledgeGraph from "./components/KnowledgeGraph.js";
import { useChat } from "./hooks/useChat.js";
import { useWebSocket } from "./hooks/useWebSocket.js";
import { Brain, Search, GitBranch, Activity } from "lucide-react";

type Tab = "chat" | "search" | "graph";

export default function App() {
  const [tab, setTab] = useState<Tab>("chat");
  const { messages, loading, error, send, captureUrl, captureText, weeklyReport } = useChat();
  const { events, connected } = useWebSocket();

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo">
          <Brain size={28} />
          <span>Second<br/>Brain</span>
        </div>
        <nav className="nav">
          {([
            { id: "chat",   icon: <Activity size={20}/>, label: "对话" },
            { id: "search", icon: <Search size={20}/>,   label: "搜索" },
            { id: "graph",  icon: <GitBranch size={20}/>, label: "图谱" },
          ] as { id: Tab; icon: React.ReactNode; label: string }[]).map((item) => (
            <button
              key={item.id}
              className={`nav-item ${tab === item.id ? "nav-item--active" : ""}`}
              onClick={() => setTab(item.id)}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <AgentStatus events={events} connected={connected} />
      </aside>

      <main className="main">
        <header className="topbar">
          <h1 className="topbar__title">
            {tab === "chat"   && "🧠 AI 第二大脑"}
            {tab === "search" && "🔍 语义搜索"}
            {tab === "graph"  && "🕸️ 知识图谱"}
          </h1>
          <div className="topbar__badges">
            <span className="badge badge--teal">RAG</span>
            <span className="badge badge--purple">Vector DB</span>
            <span className="badge badge--pink">Multi-Agent</span>
          </div>
        </header>

        {error && <div className="error-banner">⚠️ {error}</div>}

        <div className="content">
          {tab === "chat" && (
            <>
              <ChatPanel messages={messages} loading={loading} />
              <InputBar
                onSend={send}
                onCaptureUrl={captureUrl}
                onCaptureText={captureText}
                onWeeklyReport={weeklyReport}
                loading={loading}
              />
            </>
          )}
          {tab === "search" && <SearchPanel />}
          {tab === "graph"  && <KnowledgeGraph />}
        </div>
      </main>
    </div>
  );
}