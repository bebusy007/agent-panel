import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Sparkles,
  Wrench,
  Database,
  MessagesSquare,
  Star,
  FolderGit2,
  Activity,
} from "lucide-react";
import { api, type RustSessionSummary } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { useOverlayNavigate } from "@/lib/use-detail-nav";
import { StatsCard } from "@/components/StatsCard";
import { SourceBar } from "@/components/SourceBar";
import { HeatmapCalendar } from "@/components/usage/HeatmapCalendar";
import { Button } from "@/components/ui/button";
import {
  cn,
  describeSessionSource,
  formatRelative,
  sourceColor,
} from "@/lib/utils";
import { cleanupPromptPreview } from "@/lib/text-cleanup";

type HeatmapMode = "tokens" | "sessions" | "messages" | "cost";

export default function Dashboard() {
  const { data, loading, error, refetch } = useAsync(() => api.stats(), []);
  const sessions = useAsync(
    () => api.sessionsList({ limit: 8 }),
    []
  );
  const skills = useAsync(() => api.skills(), []);
  const favorites = useAsync(() => api.favoritesList(), []);
  const usage = useAsync(() => api.usageOverview({}), []);
  const [heatmapMode, setHeatmapMode] = useState<HeatmapMode>("tokens");
  const navigate = useNavigate();
  const openOverlay = useOverlayNavigate();

  const sessionCount = sessions.data?.total ?? 0;
  const favCount = favorites.data?.favorites?.length ?? 0;

  const recentSessions = sessions.data?.sessions?.slice(0, 6) ?? [];

  // Session source breakdown — from usage API (full data, not limit=8)
  const sessionBySource: Array<{ label: string; type: string; count: number }> = [];
  if (usage.data?.bySource) {
    for (const item of usage.data.bySource) {
      sessionBySource.push({
        label: describeSessionSource(item.source),
        type: item.source,
        count: item.count,
      });
    }
    sessionBySource.sort((a, b) => b.count - a.count);
  }

  // Skill source breakdown
  const skillBySource: Array<{ label: string; type: string; count: number }> = [];
  if (skills.data?.skills) {
    const counts = new Map<string, number>();
    for (const s of skills.data.skills) {
      const src = s.source.split(":")[0] || s.source;
      counts.set(src, (counts.get(src) ?? 0) + 1);
    }
    for (const [src, n] of counts) {
      skillBySource.push({ label: src, type: src, count: n });
    }
    skillBySource.sort((a, b) => b.count - a.count);
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ========== 1. Header ========== */}
      <header className="flex items-end justify-between">
        <div>
          <h1 className="typo-h1">概览</h1>
          <p className="mt-1 typo-body text-muted-foreground">
            本机 AI agent 资产看板 — Skills / MCPs / 对话历史 / 收藏，数据完全留在本地
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            refetch();
            sessions.refetch();
            skills.refetch();
            favorites.refetch();
          }}
        >
          刷新
        </Button>
      </header>

      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          加载失败：{error.message}
        </div>
      )}

      {/* ========== 2. Stats cards (clickable) ========== */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatsCard
          label="Skills"
          value={loading ? "…" : data?.totals.skills ?? 0}
          icon={Sparkles}
          colorVariant="purple"
          hint="已安装 + 可装"
          onClick={() => navigate("/skills")}
        />
        <StatsCard
          label="MCPs"
          value={loading ? "…" : data?.totals.mcps ?? 0}
          icon={Wrench}
          colorVariant="teal"
          hint="按 server 名去重"
          onClick={() => navigate("/extensions")}
        />
        <StatsCard
          label="Sessions"
          value={sessions.loading ? "…" : sessionCount}
          icon={MessagesSquare}
          colorVariant="blue"
          hint={sessions.data?.scanTimeMs
            ? `扫描 ${(sessions.data.scanTimeMs / 1000).toFixed(1)}s`
            : "对话历史"}
          onClick={() => navigate("/sessions")}
        />
        <StatsCard
          label="收藏"
          value={favorites.loading ? "…" : favCount}
          icon={Star}
          colorVariant="amber"
          hint="重要消息"
          onClick={() => navigate("/favorites")}
        />
        <StatsCard
          label="数据来源"
          value={loading ? "…" : data?.totals.sources ?? 0}
          icon={Database}
          colorVariant="green"
          hint="Claude / Cursor / Codex"
        />
      </section>

      {/* ========== 3. Activity heatmap ========== */}
      <section className="rounded-xl border border-border bg-card p-5 transition-all hover:shadow-e2">
        <header className="mb-3 flex items-center justify-between">
          <h2 className="inline-flex items-center gap-1.5 typo-label">
            <Activity className="size-3.5" />
            最近 365 天活跃度
          </h2>
          <div className="flex items-center gap-1 rounded-md border border-border bg-background/40 p-0.5">
            {(["tokens", "cost", "sessions", "messages"] as HeatmapMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setHeatmapMode(m)}
                className={cn(
                  "rounded px-2 py-0.5 text-[10px] transition-colors",
                  heatmapMode === m
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m === "tokens"
                  ? "Token"
                  : m === "cost"
                    ? "成本"
                    : m === "sessions"
                      ? "会话"
                      : "消息"}
              </button>
            ))}
          </div>
        </header>
        {usage.loading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">加载中…</div>
        ) : usage.data ? (
          <HeatmapCalendar daily={usage.data.heatmap} metric={heatmapMode} />
        ) : (
          <div className="py-12 text-center text-sm text-muted-foreground">暂无数据</div>
        )}
        <div className="mt-3 text-right text-[10px] text-muted-foreground">
          <button
            onClick={() => navigate("/usage")}
            className="hover:text-primary transition-colors"
          >
            查看完整用量统计 →
          </button>
        </div>
      </section>

      {/* ========== 4. Three-column: Skill source / Session source / Recent sessions ========== */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Skill source bar */}
        <div className="rounded-xl border border-border bg-card p-5 transition-all hover:shadow-e2 flex flex-col">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="typo-label">
              Skill 来源分布
            </h2>
            <button
              onClick={() => navigate("/skills")}
              className="text-[10px] text-muted-foreground hover:text-primary transition-colors"
            >
              查看全部 →
            </button>
          </div>
          <div className="flex-1">
            {skills.loading ? (
              <div className="text-sm text-muted-foreground">加载中…</div>
            ) : skillBySource.length === 0 ? (
              <div className="text-sm text-muted-foreground">暂无数据</div>
            ) : (
              <SourceBar items={skillBySource} max={8} />
            )}
          </div>
        </div>

        {/* Session source bar */}
        <div className="rounded-xl border border-border bg-card p-5 transition-all hover:shadow-e2 flex flex-col">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="typo-label">
              对话来源分布
            </h2>
            <button
              onClick={() => navigate("/sessions")}
              className="text-[10px] text-muted-foreground hover:text-primary transition-colors"
            >
              查看全部 →
            </button>
          </div>
          <div className="flex-1">
            {usage.loading ? (
              <div className="text-sm text-muted-foreground">加载中…</div>
            ) : sessionBySource.length === 0 ? (
              <div className="text-sm text-muted-foreground">暂无数据</div>
            ) : (
              <SourceBar items={sessionBySource} />
            )}
          </div>
        </div>

        {/* Recent sessions */}
        <div className="rounded-xl border border-border bg-card p-5 transition-all hover:shadow-e2 flex flex-col">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="inline-flex items-center gap-1.5 typo-label">
              <MessagesSquare className="size-3.5" />
              最近对话
            </h2>
            <button
              onClick={() => navigate("/sessions")}
              className="text-[10px] text-muted-foreground hover:text-primary transition-colors"
            >
              查看全部 →
            </button>
          </div>
          <div className="flex-1">
            {sessions.loading ? (
              <div className="text-sm text-muted-foreground">加载中…</div>
            ) : recentSessions.length === 0 ? (
              <div className="text-sm text-muted-foreground">暂无</div>
            ) : (
              <ul className="space-y-2">
                {recentSessions.map((s: RustSessionSummary) => (
                  <li
                    key={s.id}
                    className="cursor-pointer rounded-md px-2 py-1.5 -mx-2 hover:bg-secondary transition-colors"
                    onClick={() => openOverlay(`/sessions/${encodeURIComponent(s.id)}`)}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "shrink-0 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] ring-1 ring-inset font-medium",
                          sourceColor(s.source)
                        )}
                      >
                        {describeSessionSource(s.source).split(" ")[0]}
                      </span>
                      <div className="text-sm font-medium truncate flex-1">
                        {cleanupPromptPreview(s.title, 120) || "(无标题)"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {s.cwd && (
                        <span className="text-[10px] font-mono text-muted-foreground truncate flex items-center gap-0.5">
                          <FolderGit2 className="size-2.5 inline" />
                          {s.cwd.replace(/^\/Users\/[^/]+/, "~")}
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                        {formatRelative(s.lastActivity)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
