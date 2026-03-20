import { useState } from "react";
import { Search, X } from "lucide-react";
import { semanticSearch } from "../api/index.js";
import type { SearchResult } from "../api/index.js";

export default function SearchPanel() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await semanticSearch(query, 8);
      setResults(res.results);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="search-panel">
      <h3 className="panel-title"><Search size={16}/> 语义搜索</h3>
      <form onSubmit={handleSearch} className="search-form">
        <input
          className="search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索知识库..."
          disabled={loading}
        />
        <button className="search-btn" type="submit" disabled={loading}>
          <Search size={16} />
        </button>
      </form>
      <div className="search-results">
        {loading && <div className="loading-text">检索中...</div>}
        {results.map((r, i) => (
          <div key={i} className="search-result-item">
            <p className="result-content">{r.content}</p>
            {r.metadata?.source != null && (
              <span className="result-source">来源: {String(r.metadata.source)}</span>
            )}
            {r.score !== undefined && (
              <span className="result-score">相关度: {(r.score * 100).toFixed(0)}%</span>
            )}
          </div>
        ))}
        {!loading && results.length === 0 && query && (
          <div className="no-results">未找到相关内容</div>
        )}
      </div>
    </div>
  );
}

