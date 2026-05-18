import clsx, { type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRelative(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} 个月前`;
  const years = Math.floor(months / 12);
  return `${years} 年前`;
}

/** Absolute timestamp formatted as `YYYY/MM/DD HH:mm`. Slash-style
 *  date is denser than the locale default and reads cleanly in
 *  Chinese contexts. Drops seconds on purpose — session-level
 *  events don't move sub-minute. */
export function formatAbsolute(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}/${mo}/${da} ${hh}:${mm}`;
}

/** Full-precision timestamp: `YYYY/MM/DD HH:mm:ss`.
 *  Used in message-level blocks where second granularity matters. */
export function formatTimestamp(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${y}/${mo}/${da} ${hh}:${mm}:${ss}`;
}

/** Compact timestamp for narrow surfaces like the sidebar
 *  conversation row. Adapts to recency:
 *
 *    < today   → 23:54
 *    yesterday → 昨 23:54
 *    same week → 周三
 *    same year → 04/21
 *    older     → 25/04/21
 *
 *  Each branch is at most 5–6 characters so it fits in a
 *  20-something px column without truncation. */
export function formatSmartTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameY = d.getFullYear() === now.getFullYear();
  const sameM = sameY && d.getMonth() === now.getMonth();
  const sameD = sameM && d.getDate() === now.getDate();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (sameD) return `${hh}:${mm}`;
  // Yesterday — diff in calendar days, not millis (so 00:30 today vs
  // 23:30 yesterday correctly says "昨" instead of "1 days ago").
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  if (
    d.getFullYear() === yest.getFullYear() &&
    d.getMonth() === yest.getMonth() &&
    d.getDate() === yest.getDate()
  ) {
    return `昨 ${hh}:${mm}`;
  }
  // Same ISO week (Monday-Sunday). For a viewer-style app this is a
  // small win — "周三" reads faster than "10/16" when the user is
  // skimming "what did I do this week?".
  const dayDiff = Math.round((now.getTime() - d.getTime()) / 86_400_000);
  if (dayDiff < 7 && dayDiff > 0) {
    const dows = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    return dows[d.getDay()] ?? `${d.getMonth() + 1}/${d.getDate()}`;
  }
  if (sameY) {
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    return `${mo}/${da}`;
  }
  const yy = String(d.getFullYear()).slice(-2);
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${yy}/${mo}/${da}`;
}

export function shortPath(p: string, home = ""): string {
  if (!p) return "";
  if (home && p.startsWith(home)) return "~" + p.slice(home.length);
  // Auto-detect macOS / *nix style
  const m = p.match(/^\/Users\/[^/]+(\/.*)?$/);
  if (m) return "~" + (m[1] ?? "");
  return p;
}

export function describeSkillSource(source: string): {
  label: string;
  short: string;
} {
  if (source === "user") return { label: "Claude · 用户", short: "Claude" };
  if (source.startsWith("plugin:")) {
    const rest = source.slice(7);
    return { label: `插件 · ${rest}`, short: rest.split("/").pop() || rest };
  }
  if (source.startsWith("marketplace:")) {
    const rest = source.slice(12);
    return { label: `市场 · ${rest}`, short: `${rest.split("/").pop()} (未装)` };
  }
  return { label: source, short: source };
}

export function describeMcpSource(source: string): string {
  if (source.startsWith("project:")) return `项目 · ${source.slice(8)}`;
  if (source === "claude-user") return "Claude 用户";
  if (source === "cursor") return "Cursor";
  return source;
}

export function sourceColor(source: string): string {
  const type = source.split(":")[0] || source;
  switch (type) {
    case "claude-user":
    case "claude-plugin":
    case "claude":
    case "claude-code":
      return "text-orange-300 bg-orange-500/10 ring-orange-500/30";
    case "claude-marketplace":
      return "text-amber-300 bg-amber-500/10 ring-amber-500/30";
    case "cursor-user":
    case "cursor-project":
    case "cursor-global":
    case "cursor-agent":
    case "cursor-composer":
      return "text-sky-300 bg-sky-500/10 ring-sky-500/30";
    case "codex":
      return "text-emerald-300 bg-emerald-500/10 ring-emerald-500/30";
    case "beam":
      return "text-pink-300 bg-pink-500/10 ring-pink-500/30";
    case "custom":
      return "text-violet-300 bg-violet-500/10 ring-violet-500/30";
    default:
      return "text-fg-muted bg-bg-elevated ring-border";
  }
}

export function describeSessionSource(source: string): string {
  switch (source) {
    case "claude-code": return "Claude Code";
    case "cursor-agent": return "Cursor agent";
    case "cursor-composer": return "Cursor composer";
    case "codex": return "Codex";
    default: return source;
  }
}

export function roleColor(role: string): string {
  switch (role) {
    case "user": return "bg-secondary/60 border-border";
    case "assistant": return "bg-card border-border";
    case "tool_use": return "bg-violet-500/5 border-violet-500/20";
    case "tool_result": return "bg-emerald-500/5 border-emerald-500/20";
    case "system":
    case "meta": return "bg-amber-500/5 border-amber-500/20";
    default: return "bg-card border-border";
  }
}

export function roleLabel(role: string): string {
  switch (role) {
    case "user": return "User";
    case "assistant": return "Assistant";
    case "tool_use": return "Tool";
    case "tool_result": return "Tool result";
    case "system": return "System";
    case "meta": return "Meta";
    default: return role;
  }
}

export function copyToClipboard(text: string): Promise<void> {
  if (!text) return Promise.resolve();
  return navigator.clipboard.writeText(text);
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[i]}`;
}

/**
 * Render a USD cost. Sub-cent amounts collapse to "<$0.01" so the user
 * doesn't see a trail of zeroes. Above $1000 we drop the decimals.
 * Pass `approximate=true` to prefix with "~" — used when the underlying
 * source only reported total tokens (Codex) so we can't apportion to
 * input/output rates accurately.
 */
export function formatCost(usd: number, approximate = false): string {
  if (!Number.isFinite(usd) || usd <= 0) return "$0";
  const prefix = approximate ? "~$" : "$";
  if (usd < 0.01) return `${prefix}<0.01`;
  if (usd < 1) return `${prefix}${usd.toFixed(3)}`;
  if (usd < 100) return `${prefix}${usd.toFixed(2)}`;
  if (usd < 1000) return `${prefix}${usd.toFixed(1)}`;
  return `${prefix}${Math.round(usd).toLocaleString()}`;
}

/**
 * Condense large token counts into "12.3K" / "1.2M" style display. Numbers
 * below 1000 are shown verbatim. Decimals only kept when the head digit is a
 * single digit, so "1.2K" vs "12K" — feels right in a compact card.
 */
export function formatTokens(n: number): string {
  if (n < 1000) return n.toLocaleString();
  if (n < 1_000_000) {
    const k = n / 1000;
    return k >= 10 ? `${Math.round(k)}K` : `${k.toFixed(1)}K`;
  }
  const m = n / 1_000_000;
  return m >= 10 ? `${Math.round(m)}M` : `${m.toFixed(1)}M`;
}
