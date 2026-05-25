import { extractOutputText, shortenPath } from '@/lib/tool-rendering';
import type { Message } from '@/lib/api';
import { CopyButton } from '../ToolCardHeader';

export function GrepCard({ tool, result }: { tool: Message; result?: Message }) {
  const input = (tool.toolInput as Record<string, unknown> | undefined) ?? {};
  const pattern =
    (input.pattern as string) || (input.query as string) || (input.glob as string) || '';
  const path = (input.path as string) || (input.cwd as string) || '';
  const out = result?.toolOutput ?? extractOutputText(tool.toolOutput);

  const lines = out ? out.split('\n').filter(Boolean) : [];
  const matchCount = lines.length;

  return (
    <div className="space-y-1 px-3 pb-3">
      <div className="flex items-center justify-between rounded-md border border-purple-500/30 bg-purple-500/5 px-2.5 py-1 text-[11px]">
        <span className="font-mono text-purple-200">
          {pattern || '(no pattern)'}
          {path && <span className="ml-1.5 text-muted-foreground">in {shortenPath(path)}</span>}
        </span>
        <span className="text-muted-foreground tabular-nums">{matchCount} 行</span>
      </div>
      {out ? (
        <div className="rounded-md border border-border bg-background/40">
          <div className="flex items-center justify-between border-b border-border/40 px-2.5 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            <span>matches</span>
            <CopyButton text={out} />
          </div>
          <pre className="max-h-[400px] overflow-auto whitespace-pre px-2.5 py-1.5 font-mono text-[11px] leading-snug text-muted-foreground">
            {out}
          </pre>
        </div>
      ) : (
        <p className="text-[11px] italic text-muted-foreground">无结果或未记录结果</p>
      )}
    </div>
  );
}
