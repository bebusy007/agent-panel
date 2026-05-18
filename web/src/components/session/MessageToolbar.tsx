import { useEffect } from "react";
import { Search as SearchIcon, ChevronUp, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ALL_FILTERS, type FilterRole } from "@/lib/use-session-search";
import { getRoleTheme } from "@/lib/role-theme";
import { useSession } from "./SessionContext";

export function MessageToolbar() {
  const { messageCount, search: s } = useSession();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        s.setSearchOpen(true);
        setTimeout(() => {
          document.getElementById("session-detail-search")?.focus();
        }, 0);
      }
      if (e.key === "Escape" && s.searchOpen) {
        s.setSearchOpen(false);
        s.setSearch("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [s]);

  return (
    <>
      <div className="flex flex-nowrap overflow-x-auto items-center gap-1 border-b border-border px-4 py-2 text-[11px]">
        <span className="text-muted-foreground uppercase tracking-wider mr-0.5">
          角色
        </span>
        {ALL_FILTERS.map((r: FilterRole) => {
          const on = s.selectedRoles.has(r);
          const theme = getRoleTheme(r);
          const Icon = theme.icon;
          return (
            <button
              key={r}
              onClick={() => s.toggleRole(r)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 border transition-colors whitespace-nowrap text-[11px]",
                on
                  ? cn(theme.bgChipActive, theme.borderChipActive, theme.color)
                  : cn(theme.bgChip, theme.borderChip, "text-muted-foreground hover:text-fg"),
              )}
            >
              <Icon className="size-3" />
              {theme.label}
            </button>
          );
        })}
        <span className="ml-auto text-muted-foreground tabular-nums">
          {messageCount} 消息 · 显示 {s.filtered.length}
        </span>
        <button
          onClick={() => s.setSearchOpen(!s.searchOpen)}
          className={cn(
            "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 transition-colors",
            s.searchOpen
              ? "border-accent/50 bg-accent/10 text-accent"
              : "border-border text-muted-foreground hover:border-border",
          )}
          title="在此对话内搜索 (Cmd+F)"
        >
          <SearchIcon className="size-3" /> 内搜
        </button>
      </div>
      {s.searchOpen && (
        <div className="flex items-center gap-2 border-b border-border px-4 py-2">
          <input
            id="session-detail-search"
            autoFocus
            value={s.search}
            onChange={(e) => s.setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                s.navigateSearch(e.shiftKey ? "prev" : "next");
              }
            }}
            placeholder="搜索当前对话消息内容（≥2字符）"
            className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-border"
          />
          {s.searchActive && s.searchMatchTotal > 0 && (
            <span className="text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">
              {s.searchActiveIndex >= 0 ? s.searchActiveIndex + 1 : 0}/
              {s.searchMatchTotal}
            </span>
          )}
          {s.searchActive && s.searchMatchTotal === 0 && (
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">
              无匹配
            </span>
          )}
          <button
            onClick={() => s.navigateSearch("prev")}
            disabled={s.searchMatchTotal === 0}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronUp className="size-4" />
          </button>
          <button
            onClick={() => s.navigateSearch("next")}
            disabled={s.searchMatchTotal === 0}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronDown className="size-4" />
          </button>
          <button
            onClick={() => {
              s.setSearch("");
              s.setSearchOpen(false);
            }}
            className="text-muted-foreground hover:text-muted-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      )}
    </>
  );
}
