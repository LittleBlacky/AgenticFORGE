import { useEffect, useState } from "react";
import { GitBranch } from "lucide-react";
import { semanticSearch } from "../api/index.js";

interface GraphNode {
  id: string;
  label: string;
  group: string;
}

interface GraphLink {
  source: string;
  target: string;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

const GROUP_COLORS: Record<string, string> = {
  capture: "#00d4aa",
  research: "#7c6aff",
  generate: "#ff6b9d",
  plan: "#ffa94d",
  default: "#74c0fc",
};

export default function KnowledgeGraph() {
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("知识");

  const loadGraph = async (q: string) => {
    setLoading(true);
    try {
      const res = await semanticSearch(q, 12);
      const nodes: GraphNode[] = res.results.map((r, i) => ({
        id: `node-${i}`,
        label: r.content.slice(0, 40) + (r.content.length > 40 ? "..." : ""),
        group: (r.metadata?.source as string) ?? "default",
      }));
      // 根据相似度建立连接（简单示例：相邻节点互连）
      const links: GraphLink[] = [];
      for (let i = 0; i < nodes.length - 1; i++) {
        if (i % 3 !== 2) {
          links.push({ source: nodes[i].id, target: nodes[i + 1].id });
        }
        if (i > 0 && i % 4 === 0) {
          links.push({ source: nodes[0].id, target: nodes[i].id });
        }
      }
      setGraphData({ nodes, links });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadGraph(query); }, []);

  return (
    <div className="knowledge-graph">
      <div className="graph-header">
        <GitBranch size={16} />
        <span>知识图谱</span>
        <input
          className="graph-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && loadGraph(query)}
          placeholder="搜索主题..."
        />
        <button className="graph-refresh" onClick={() => loadGraph(query)} disabled={loading}>
          {loading ? "加载中" : "刷新"}
        </button>
      </div>
      <div className="graph-canvas">
        {graphData.nodes.length === 0 && !loading && (
          <div className="graph-empty">知识库为空，先捕获一些知识吧</div>
        )}
        <svg width="100%" height="100%" viewBox="0 0 600 400">
          <defs>
            <marker id="arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="#444" />
            </marker>
          </defs>
          {graphData.links.map((link, i) => {
            const src = graphData.nodes.find((n) => n.id === link.source);
            const tgt = graphData.nodes.find((n) => n.id === link.target);
            if (!src || !tgt) return null;
            const si = graphData.nodes.indexOf(src);
            const ti = graphData.nodes.indexOf(tgt);
            const cols = 4;
            const sx = 80 + (si % cols) * 130;
            const sy = 60 + Math.floor(si / cols) * 90;
            const tx = 80 + (ti % cols) * 130;
            const ty = 60 + Math.floor(ti / cols) * 90;
            return (
              <line key={i} x1={sx} y1={sy} x2={tx} y2={ty}
                stroke="#333" strokeWidth="1" markerEnd="url(#arrow)" />
            );
          })}
          {graphData.nodes.map((node, i) => {
            const cols = 4;
            const cx = 80 + (i % cols) * 130;
            const cy = 60 + Math.floor(i / cols) * 90;
            const color = GROUP_COLORS[node.group] ?? GROUP_COLORS.default;
            return (
              <g key={node.id}>
                <circle cx={cx} cy={cy} r={22} fill={color} fillOpacity={0.2}
                  stroke={color} strokeWidth={2} />
                <text x={cx} y={cy - 30} textAnchor="middle"
                  fill="#ccc" fontSize={9} fontFamily="JetBrains Mono">
                  {node.label.slice(0, 18)}
                </text>
                <circle cx={cx} cy={cy} r={5} fill={color} />
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

