import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Sparkles,
  Wrench,
  Webhook,
  Bot,
  Search,
  X,
  Terminal,
  Package,
} from "lucide-react";
import { api, type RustHookEntry, type RustAgentEntry, type RustCommandEntry, type RustPluginEntry } from "@/lib/api";
import { useCachedAsync, useDebounced } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import SkillsView from "./SkillsView";
import MCPsView from "./MCPsView";

type Section = "skills" | "mcp" | "hooks" | "agents" | "commands" | "plugins";

const SECTION_NAV: { key: Section; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "skills", label: "Skills", icon: Sparkles },
  { key: "mcp", label: "MCP", icon: Wrench },
  { key: "hooks", label: "Hooks", icon: Webhook },
  { key: "agents", label: "Agents", icon: Bot },
  { key: "commands", label: "Commands", icon: Terminal },
  { key: "plugins", label: "Plugins", icon: Package },
];

export default function ExtensionsView() {
  const [params, setParams] = useSearchParams();
  const section = ((params.get("section") as Section) || "skills") as Section;
  const setSection = (s: Section) => {
    const next = new URLSearchParams(params);
    if (s === "skills") next.delete("section");
    else next.set("section", s);
    setParams(next, { replace: true });
  };

  const summary = useCachedAsync("extensions:summary", () => api.extensionsSummary(), []);

  return (
    <div className="space-y-4 animate-fade-in">
      <header>
        <h1 className="typo-h1">扩展</h1>
        <p className="mt-1 typo-body text-muted-foreground">
          本机所有 AI agent 资产 — Skills / MCP / Hooks / Agents
        </p>
      </header>

      <nav className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-1">
        {SECTION_NAV.map((n) => {
          const active = section === n.key;
          const count =
            n.key === "hooks" ? summary.data?.hooks
            : n.key === "agents" ? summary.data?.agents
            : n.key === "plugins" ? summary.data?.plugins
            : undefined;
          return (
            <button
              key={n.key}
              onClick={() => setSection(n.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                active ? "bg-secondary text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <n.icon className="size-3.5" />
              {n.label}
              {typeof count === "number" && (
                <span className="tabular-nums text-muted-foreground">{count}</span>
              )}
            </button>
          );
        })}
      </nav>

      {section === "skills" && <SkillsView />}
      {section === "mcp" && <MCPsView />}
      {section === "hooks" && <HooksSection />}
      {section === "agents" && <AgentsSection />}
      {section === "commands" && <CommandsSection />}
      {section === "plugins" && <PluginsSection />}
    </div>
  );
}

function HooksSection() {
  const { data, loading, error } = useCachedAsync("extensions:hooks", () => api.hooks(), []);
  const hooks = data?.hooks ?? [];

  const grouped = useMemo(() => {
    const m = new Map<string, RustHookEntry[]>();
    for (const h of hooks) {
      const arr = m.get(h.event) ?? [];
      arr.push(h);
      m.set(h.event, arr);
    }
    return Array.from(m.entries());
  }, [hooks]);

  if (loading) return <div className="py-6 text-center text-sm text-muted-foreground">加载中…</div>;
  if (error) return <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">{error.message}</div>;
  if (hooks.length === 0) return (
    <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
      本机未配置任何 Claude Code hook
      <div className="mt-2 font-mono text-[11px]">~/.claude/settings.json → hooks: {"{...}"}</div>
    </div>
  );

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        共 <span className="text-foreground tabular-nums">{hooks.length}</span> 个 hook，
        分布在 <span className="text-foreground tabular-nums">{grouped.length}</span> 个事件类型。
      </p>
      {grouped.map(([event, list]) => (
        <section key={event}>
          <h2 className="mb-2 typo-label">
            {event} <span className="text-muted-foreground">({list.length})</span>
          </h2>
          <div className="space-y-2">
            {list.map((h, i) => (
              <div key={`${event}-${i}`} className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="rounded bg-secondary px-1.5 py-0.5 text-muted-foreground">scope: {h.scope}</span>
                </div>
                <div className="mt-2 space-y-1">
                  {h.commands.map((cmd, ci) => (
                    <pre key={ci} className="overflow-x-auto rounded-md border border-border bg-background/60 px-2.5 py-1.5 font-mono text-xs text-emerald-200">
                      {cmd}
                    </pre>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function AgentsSection() {
  const { data, loading, error } = useCachedAsync("agents:list", () => api.agents(), []);
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query, 200);
  const agents = data?.agents ?? [];

  const filtered = useMemo(() => {
    const q = debounced.trim().toLowerCase();
    if (q.length < 2) return agents;
    return agents.filter((a) =>
      a.name.toLowerCase().includes(q) || (a.description ?? "").toLowerCase().includes(q)
    );
  }, [agents, debounced]);

  if (loading && agents.length === 0) return <div className="py-6 text-center text-sm text-muted-foreground">加载中…</div>;
  if (error) return <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">{error.message}</div>;
  if (agents.length === 0) return (
    <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
      本机未发现 agent 定义
      <div className="mt-2 font-mono text-[11px]">~/.claude/agents/&lt;name&gt;.md</div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="筛选 agent 名称 / 描述（≥2字符）"
          className="h-9 w-full rounded-lg border border-border bg-background/40 pl-9 pr-9 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40" />
        {query && <button onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-secondary"><X className="size-3.5" /></button>}
      </div>
      <p className="text-xs text-muted-foreground">
        共 <span className="text-foreground tabular-nums">{filtered.length}</span> 个 agent
      </p>
      <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((a) => (
          <li key={a.name} className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-center gap-2">
              <Bot className="size-3.5 text-purple-400" />
              <h3 className="truncate text-sm font-semibold text-foreground">{a.name}</h3>
            </div>
            {a.description && <p className="mt-1.5 line-clamp-3 text-xs text-muted-foreground">{a.description}</p>}
            <div className="mt-2 text-[10px] font-mono text-muted-foreground truncate">{a.filePath}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CommandsSection() {
  const { data, loading, error } = useCachedAsync("extensions:commands", () => api.commands(), []);
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query, 200);
  const commands = data?.commands ?? [];

  const filtered = useMemo(() => {
    const q = debounced.trim().toLowerCase();
    if (q.length < 2) return commands;
    return commands.filter((c) =>
      c.command.toLowerCase().includes(q) || c.skill.toLowerCase().includes(q)
    );
  }, [commands, debounced]);

  if (loading) return <div className="py-6 text-center text-sm text-muted-foreground">加载中…</div>;
  if (error) return <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">{error.message}</div>;
  if (commands.length === 0) return (
    <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
      本机未发现 slash command
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="筛选命令名 / 所属 skill（≥2字符）"
            className="h-9 w-full rounded-lg border border-border bg-background/40 pl-9 pr-9 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40" />
          {query && <button onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-secondary"><X className="size-3.5" /></button>}
        </div>
        <span className="text-xs text-muted-foreground">共 <span className="text-foreground tabular-nums">{filtered.length}</span> 个</span>
      </div>
      <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((c, i) => (
          <li key={`${c.command}-${i}`} className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-center gap-2">
              <Terminal className="size-3.5 text-blue-400" />
              <code className="truncate text-sm font-mono font-semibold text-blue-300">{c.command}</code>
            </div>
            <div className="mt-1.5 text-[11px] text-muted-foreground">
              skill: <span className="text-foreground">{c.skill}</span> · source: {c.source}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PluginsSection() {
  const { data, loading, error } = useCachedAsync("extensions:plugins", () => api.plugins(), []);
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query, 200);
  const plugins = data?.plugins ?? [];

  const filtered = useMemo(() => {
    const q = debounced.trim().toLowerCase();
    if (q.length < 2) return plugins;
    return plugins.filter((p) => p.name.toLowerCase().includes(q) || p.scope.toLowerCase().includes(q));
  }, [plugins, debounced]);

  if (loading) return <div className="py-6 text-center text-sm text-muted-foreground">加载中…</div>;
  if (error) return <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">{error.message}</div>;
  if (plugins.length === 0) return (
    <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
      本机未安装任何 Claude Code plugin
      <div className="mt-2 font-mono text-[11px]">~/.claude/plugins/installed_plugins.json</div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="筛选插件名 / scope（≥2字符）"
            className="h-9 w-full rounded-lg border border-border bg-background/40 pl-9 pr-9 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40" />
        </div>
        <span className="text-xs text-muted-foreground">
          已装 <span className="text-foreground tabular-nums">{plugins.length}</span>
        </span>
      </div>
      <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        {filtered.map((p, i) => (
          <li key={`${p.name}-${i}`} className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-center gap-2">
              <Package className="size-3.5 text-emerald-400" />
              <h3 className="truncate text-sm font-semibold text-foreground">{p.name}</h3>
              {p.version && (
                <code className="rounded bg-secondary px-1.5 py-px text-[10px] font-mono text-muted-foreground">{p.version}</code>
              )}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              scope: {p.scope}
              {p.installPath && <span className="ml-2 font-mono truncate">{p.installPath}</span>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
