import { useEffect, useRef, useState } from 'react';
import { Copy, Check, FileText, Wrench, Server } from 'lucide-react';
import { COPY_FEEDBACK_LONG_MS } from '@/lib/constants';
import { api, type RustMcpSummary } from '@/lib/api';
import { InPaneSearchBar, useInPaneSearch } from './InPaneSearch';

export function MCPDetail({ id }: { id: string }) {
  const [mcp, setMcp] = useState<RustMcpSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const contentKey = mcp?.serverName ?? '';
  const search = useInPaneSearch({ containerRef: bodyRef, contentKey });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .mcp(id)
      .then((r) => {
        if (!cancelled && 'mcp' in r) setMcp(r.mcp);
        else if (!cancelled && 'error' in r) setError(new Error((r as { error: string }).error));
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const copy = (txt: string) => {
    navigator.clipboard.writeText(txt).then(() => {
      setCopied(txt);
      setTimeout(() => setCopied(null), COPY_FEEDBACK_LONG_MS);
    });
  };

  if (loading) return <div className="p-6 text-sm text-muted-foreground">加载中…</div>;
  if (error) return <div className="p-6 text-sm text-red-300">加载失败：{error.message}</div>;
  if (!mcp) return <div className="p-6 text-sm text-muted-foreground">未找到</div>;

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 pt-3 pb-2 border-b border-border flex flex-wrap items-center gap-2">
        <span className="text-xs rounded bg-secondary px-1.5 py-0.5 text-muted-foreground">
          {mcp.source}
        </span>
        {mcp.configuredIn
          .filter((s) => s !== mcp.source)
          .map((s) => (
            <span
              key={s}
              className="text-xs rounded bg-secondary px-1.5 py-0.5 text-muted-foreground"
            >
              {s}
            </span>
          ))}
        <div className="ml-auto">
          <InPaneSearchBar state={search} inputId="mcp-detail-search" />
        </div>
      </div>

      <div ref={bodyRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {/* Command/URL */}
        {mcp.description && (
          <section className="rounded-lg border border-border bg-background/40 p-3 text-xs">
            <div className="text-muted-foreground mb-1">配置</div>
            <div className="flex items-start gap-2">
              <Server className="size-3 mt-0.5 text-muted-foreground shrink-0" />
              <code className="font-mono break-all text-muted-foreground text-[11px] flex-1">
                {mcp.description}
              </code>
              <button
                onClick={() => copy(mcp.description!)}
                className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
              >
                {copied === mcp.description ? (
                  <Check className="size-3 text-emerald-400" />
                ) : (
                  <Copy className="size-3" />
                )}
              </button>
            </div>
          </section>
        )}

        {/* Configured in */}
        {mcp.configuredIn.length > 0 && (
          <section className="rounded-lg border border-border bg-background/40 p-3 text-xs">
            <div className="text-muted-foreground mb-1">配置来源 ({mcp.configuredIn.length})</div>
            <ul className="space-y-1">
              {mcp.configuredIn.map((src) => (
                <li key={src} className="font-mono text-[11px] text-muted-foreground">
                  {src}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Tools */}
        {mcp.toolNames.length > 0 ? (
          <section>
            <div className="text-xs text-muted-foreground mb-2">Tools ({mcp.toolCount})</div>
            <ul className="space-y-1.5">
              {mcp.toolNames.map((name) => (
                <li
                  key={name}
                  className="rounded-lg border border-border bg-background/30 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <Wrench className="size-3 text-muted-foreground" />
                    <span className="text-sm font-mono">{name}</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <section className="text-xs text-muted-foreground">
            该 MCP 报告 {mcp.toolCount} 个 tool，但详细列表未缓存
          </section>
        )}

        {/* Resources */}
        {mcp.resourceCount > 0 && (
          <section className="text-xs text-muted-foreground">
            Resources: {mcp.resourceCount} 个（详情需要运行 MCP 后获取）
          </section>
        )}
      </div>
    </div>
  );
}
