import type { MCPSummary } from '@/lib/api';
import { McpSourceBadge } from './SourceBadge';
import { Wrench, Files, Network } from 'lucide-react';
import { cn } from '@/lib/utils';
import { highlightJsx } from '@/lib/highlight';

export function MCPCard({
  mcp,
  onClick,
  active,
  highlight,
}: {
  mcp: MCPSummary;
  onClick?: () => void;
  active?: boolean;
  highlight?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'block w-full text-left rounded-xl border bg-card p-4 transition-all duration-200 hover:shadow-e2 focus:outline-none',
        active
          ? 'border-2 border-primary bg-[color-mix(in_srgb,var(--primary)_5%,transparent)]'
          : 'border-border',
      )}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-semibold tracking-tight truncate">
              {highlight ? highlightJsx(mcp.serverName, highlight) : mcp.serverName}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground flex-wrap">
            <McpSourceBadge source={mcp.source} />
            {mcp.configuredIn && mcp.configuredIn.length > 1 && (
              <span className="inline-flex items-center gap-0.5">
                <Network className="size-3" />
                配置 {mcp.configuredIn.length} 处
              </span>
            )}
          </div>
        </div>
      </div>

      {mcp.description && (
        <p className="mt-3 text-xs font-mono leading-relaxed text-muted-foreground line-clamp-3 break-all">
          {highlight ? highlightJsx(mcp.description, highlight) : mcp.description}
        </p>
      )}

      <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Wrench className="size-3" /> {mcp.toolCount} tools
        </span>
        {mcp.resourceCount > 0 && (
          <span className="inline-flex items-center gap-1">
            <Files className="size-3" /> {mcp.resourceCount} resources
          </span>
        )}
      </div>

      {mcp.toolNames.length > 0 && (
        <div className="mt-2 flex items-center gap-1 flex-wrap">
          {mcp.toolNames.slice(0, 5).map((t) => (
            <span
              key={t}
              className="text-[11px] font-mono rounded-md bg-secondary text-secondary-foreground px-1.5 py-0.5"
            >
              {t}
            </span>
          ))}
          {mcp.toolNames.length > 5 && (
            <span className="text-[10px] text-muted-foreground">+{mcp.toolNames.length - 5}</span>
          )}
        </div>
      )}
    </button>
  );
}
