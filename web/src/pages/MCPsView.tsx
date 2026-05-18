import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useCachedAsync, useDebounced } from "@/lib/hooks";
import { useOverlayNavigate } from "@/lib/use-detail-nav";
import { SearchBar } from "@/components/SearchBar";
import { FilterChips } from "@/components/FilterChips";
import { MasonryGrid } from "@/components/MasonryGrid";
import { MCPCard } from "@/components/MCPCard";
import { describeMcpSource } from "@/lib/utils";
import type { MCPSummary } from "@/lib/api";

/** Mirror of SkillsView (cached fetch + overlay detail + plain
 *  useState for filters because the list never unmounts). See
 *  SkillsView for the rationale. */
export default function MCPsView() {
  const { data, loading, error, refetch } = useCachedAsync(
    "mcps:list",
    () => api.mcps(),
    [],
  );
  const openOverlay = useOverlayNavigate();

  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounced(query, 150);
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());

  const mcps = data?.mcps ?? [];

  const sourceOptions = useMemo(() => {
    const counts = new Map<string, { value: string; label: string; count: number }>();
    for (const m of mcps) {
      const cur = counts.get(m.source);
      if (cur) cur.count++;
      else counts.set(m.source, { value: m.source, label: describeMcpSource(m.source), count: 1 });
    }
    return Array.from(counts.values()).sort((a, b) => b.count - a.count);
  }, [mcps]);

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    return mcps.filter((m) => {
      if (selectedSources.size > 0 && !selectedSources.has(m.source)) return false;
      if (!q) return true;
      const hay = [m.serverName, m.description, ...m.toolNames]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [mcps, debouncedQuery, selectedSources]);

  const openDetail = (id: string) => {
    openOverlay(`/mcps/${encodeURIComponent(id)}`);
  };

  const toggleSource = (v: string) =>
    setSelectedSources((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="typo-h1">MCP Servers</h1>
          <p className="text-sm text-muted-foreground mt-1">
            共 <span className="text-fg">{mcps.length}</span> 个 server，当前显示{" "}
            <span className="text-fg">{filtered.length}</span>
          </p>
        </div>
        <button
          onClick={refetch}
          className="text-xs px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-fg hover:border-border transition-colors"
        >
          重新扫描
        </button>
      </header>

      <div className="space-y-3">
        <SearchBar
          value={query}
          onChange={setQuery}
          placeholder="搜索 server 名 / tool 名 / 配置命令…"
          tip="搜索范围：Server 名称、tool 名、描述、配置命令"
          resultCount={query ? filtered.length : undefined}
        />
        {sourceOptions.length > 0 && (
          <div>
            <div className="typo-label mb-1.5">来源</div>
            <FilterChips
              options={sourceOptions}
              selected={selectedSources}
              onToggle={toggleSource}
              onClear={() => setSelectedSources(new Set())}
            />
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          加载失败：{error.message}
        </div>
      )}

      {loading && mcps.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center">扫描中…</div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center">没有符合条件的 MCP</div>
      ) : (
        <MasonryGrid>
          {filtered.map((m: MCPSummary) => (
            <MCPCard
              key={m.serverName}
              mcp={m}
              onClick={() => openDetail(m.serverName)}
              highlight={debouncedQuery}
            />
          ))}
        </MasonryGrid>
      )}
    </div>
  );
}
