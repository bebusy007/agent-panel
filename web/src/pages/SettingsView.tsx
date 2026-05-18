import { useState } from "react";
import { ChevronRight, FileText, Monitor, Moon, Sun, Minus, Plus, RotateCcw } from "lucide-react";
import { Link } from "react-router-dom";
import { useTheme } from "@/components/ThemeProvider";
import { cn } from "@/lib/utils";
import {
  TYPO_LEVELS,
  loadTypography,
  saveTypography,
  applyTypography,
  getDefaults,
} from "@/lib/typography";

type ThemeOption = { value: "light" | "dark" | "system"; label: string; icon: React.ElementType };

const THEMES: ThemeOption[] = [
  { value: "system", label: "跟随系统", icon: Monitor },
  { value: "light", label: "浅色", icon: Sun },
  { value: "dark", label: "深色", icon: Moon },
];

export default function SettingsView() {
  const { theme, setTheme } = useTheme();
  const [typo, setTypo] = useState(loadTypography);

  const updateLevel = (key: string, delta: number) => {
    const level = TYPO_LEVELS.find((l) => l.key === key);
    if (!level) return;
    const next = Math.max(level.min, Math.min(level.max, typo[key] + delta));
    const updated = { ...typo, [key]: next };
    setTypo(updated);
    saveTypography(updated);
    applyTypography(updated);
  };

  const resetTypo = () => {
    const defaults = getDefaults();
    setTypo(defaults);
    saveTypography(defaults);
    applyTypography(defaults);
  };

  const isDefault = TYPO_LEVELS.every((l) => typo[l.key] === l.defaultPx);

  return (
    <div className="space-y-8 animate-fade-in max-w-2xl">
      <header>
        <h1 className="typo-h1">设置</h1>
        <p className="mt-1 typo-body text-muted-foreground">
          自定义 Agent Panel 的外观和行为
        </p>
      </header>

      {/* Appearance */}
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="typo-label">外观</h2>
          <span className="text-[10px] font-mono text-muted-foreground/50">v0.0.2</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {THEMES.map((t) => {
            const active = theme === t.value;
            const Icon = t.icon;
            return (
              <button
                key={t.value}
                onClick={() => setTheme(t.value)}
                className={cn(
                  "flex flex-col items-center gap-3 rounded-xl border-2 p-5 transition-all duration-200",
                  active
                    ? "border-primary bg-[color-mix(in_srgb,var(--primary)_8%,transparent)] shadow-glow"
                    : "border-border bg-card hover:border-muted-foreground/30"
                )}
              >
                <div
                  className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center",
                    active
                      ? "bg-[color-mix(in_srgb,var(--primary)_15%,transparent)]"
                      : "bg-secondary"
                  )}
                >
                  <Icon
                    className="w-5 h-5"
                    style={{ color: active ? "var(--primary)" : "var(--muted-foreground)" }}
                  />
                </div>
                <span className={cn(
                  "text-sm font-medium",
                  active ? "text-foreground" : "text-muted-foreground"
                )}>
                  {t.label}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Typography */}
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="typo-label">字号</h2>
          {!isDefault && (
            <button
              onClick={resetTypo}
              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors"
            >
              <RotateCcw className="size-3" /> 恢复默认
            </button>
          )}
        </div>
        <div className="space-y-3">
          {TYPO_LEVELS.map((level) => {
            const val = typo[level.key];
            const isCustom = val !== level.defaultPx;
            return (
              <div
                key={level.key}
                className="flex items-center gap-3 rounded-lg border border-border/50 bg-background/30 px-4 py-2.5"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground">{level.label}</div>
                  <div className="text-xs text-muted-foreground">{level.hint}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => updateLevel(level.key, -1)}
                    disabled={val <= level.min}
                    className="size-7 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <Minus className="size-3" />
                  </button>
                  <span className={cn(
                    "w-10 text-center font-mono text-sm tabular-nums",
                    isCustom ? "text-primary font-medium" : "text-muted-foreground"
                  )}>
                    {val}
                  </span>
                  <button
                    onClick={() => updateLevel(level.key, 1)}
                    disabled={val >= level.max}
                    className="size-7 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <Plus className="size-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Live preview */}
        <div className="mt-4 rounded-lg border border-border/50 bg-background/30 p-4 space-y-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">实时预览</div>
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <h3 className="text-2xl font-semibold tracking-tight">H1 · 会话详情</h3>
            <p className="text-base font-semibold">H2 · Cursor Agent 对话记录</p>
            <p className="text-sm text-foreground">Body · 这段文字展示正文字号，用于消息内容、列表项和描述文字。The quick brown fox jumps over the lazy dog.</p>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs text-muted-foreground">Caption · 2026-05-12 15:30 · 12 条消息</span>
              <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-xs ring-1 ring-inset ring-emerald-400/30 text-emerald-400 font-medium">Claude Code</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Label · SKILL 来源分布</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-muted-foreground">Sub · ~/workspace/skill-panel · 扫描 0.5s</span>
              <span className="text-[10px] font-mono text-muted-foreground tabular-nums">Token: 1,234,567</span>
            </div>
            <div className="rounded-lg border border-l-2 border-violet-500/30 bg-violet-500/5 px-3 py-2">
              <div className="flex items-center gap-1 text-[11px] font-medium text-violet-400 mb-1">
                Tool Use · <span className="font-mono text-muted-foreground">Bash</span>
              </div>
              <pre className="text-[11px] font-mono text-muted-foreground">cargo build --release</pre>
            </div>
          </div>
        </div>
      </section>

      {/* Logs link */}
      <Link
        to="/settings/logs"
        className="flex items-center gap-3 rounded-xl border border-border bg-card p-5 hover:border-muted-foreground/30 transition-colors group"
      >
        <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center shrink-0">
          <FileText className="w-5 h-5 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-medium text-foreground">日志</h2>
          <p className="text-xs text-muted-foreground">查看系统运行日志，按天存储、自动轮转</p>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
      </Link>

      {/* About */}
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="typo-label mb-3">关于</h2>
        <div className="text-sm text-muted-foreground space-y-1">
          <div>Agent Panel — 本机 AI agent 资产看板</div>
          <div className="text-xs text-muted-foreground/60">
            Skills / MCPs / 对话历史 / 收藏，数据完全留在本地
          </div>
          <div className="mt-3 pt-3 border-t border-border text-xs text-muted-foreground/50 font-mono">
            Design System v0.0.1
          </div>
        </div>
      </section>
    </div>
  );
}
