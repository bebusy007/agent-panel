import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useCachedAsync, useDebounced } from '@/lib/hooks';
import { useOverlayNavigate } from '@/lib/use-detail-nav';
import { SearchBar } from '@/components/SearchBar';
import { FilterChips } from '@/components/FilterChips';
import { MasonryGrid } from '@/components/MasonryGrid';
import { SkillCard } from '@/components/SkillCard';
import { describeSkillSource } from '@/lib/utils';
import type { SkillSummary } from '@/lib/api';

/**
 * Skills listing.
 *
 * State design:
 *  - Search query, source filter, trigger filter live in plain
 *    useState. The list is rendered inside the Modal Route Pattern
 *    overlay parent, so the component stays mounted across detail
 *    navigation — no need to mirror state into URL or storage.
 *  - Skills payload comes through `useCachedAsync` so a hard
 *    refresh (or a navigation that does unmount us, e.g. switching
 *    away to /usage and back) returns instantly with cached data
 *    while a background revalidate runs.
 *  - Detail view is an overlay route (`/skills/:id`).
 */
export default function SkillsView() {
  const { data, loading, error, refetch } = useCachedAsync('skills:list', () => api.skills(), []);
  const openOverlay = useOverlayNavigate();

  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounced(query, 150);
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
  const [selectedTriggers, setSelectedTriggers] = useState<Set<string>>(new Set());

  const skills = data?.skills ?? [];

  const sourceOptions = useMemo(() => {
    const counts = new Map<string, { value: string; label: string; count: number }>();
    for (const s of skills) {
      const desc = describeSkillSource(s.source);
      const key = s.source.split(':')[0];
      const cur = counts.get(key);
      if (cur) cur.count++;
      else counts.set(key, { value: key, label: desc.label.split(' · ')[0]!, count: 1 });
    }
    return Array.from(counts.values()).sort((a, b) => b.count - a.count);
  }, [skills]);

  const triggerOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of skills) {
      for (const t of s.triggers ?? []) {
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .map(([value, count]) => ({ value, label: value, count }))
      .filter((o) => o.count >= 2 || selectedTriggers.has(o.value))
      .sort((a, b) => b.count - a.count)
      .slice(0, 30);
  }, [skills, selectedTriggers]);

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    return skills.filter((s) => {
      if (selectedSources.size > 0 && !selectedSources.has(s.source.split(':')[0])) return false;
      if (selectedTriggers.size > 0) {
        const tset = new Set(s.triggers ?? []);
        let any = false;
        for (const t of selectedTriggers)
          if (tset.has(t)) {
            any = true;
            break;
          }
        if (!any) return false;
      }
      if (q.length < 2) return true;
      const hay = [s.name, s.description, s.description, ...(s.triggers ?? []), ...s.cliCommands]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [skills, debouncedQuery, selectedSources, selectedTriggers]);

  const openDetail = (id: string) => {
    openOverlay(`/skills/${encodeURIComponent(id)}`);
  };

  const toggleSource = (v: string) =>
    setSelectedSources((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  const toggleTrigger = (v: string) =>
    setSelectedTriggers((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="typo-h1">Skills</h1>
          <p className="text-sm text-muted-foreground mt-1">
            共 <span className="text-fg">{skills.length}</span> 个，当前显示{' '}
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
          placeholder="筛选名称 / 描述 / 触发词 / 命令（≥2字符）"
          tip="搜索范围：Skill 名称、描述、触发词、CLI 命令、正文摘要"
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
        {triggerOptions.length > 0 && (
          <div>
            <div className="typo-label mb-1.5">热门触发词</div>
            <FilterChips
              options={triggerOptions}
              selected={selectedTriggers}
              onToggle={toggleTrigger}
              onClear={() => setSelectedTriggers(new Set())}
            />
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          加载失败：{error.message}
        </div>
      )}

      {loading && skills.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center">扫描中…</div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center">没有符合条件的 Skill</div>
      ) : (
        <MasonryGrid>
          {filtered.map((s: SkillSummary) => (
            <SkillCard
              key={s.id}
              skill={s}
              onClick={() => openDetail(s.id)}
              highlight={debouncedQuery}
            />
          ))}
        </MasonryGrid>
      )}
    </div>
  );
}
