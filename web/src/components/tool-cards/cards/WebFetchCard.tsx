import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { extractOutputText } from '@/lib/tool-rendering';
import type { Message } from '@/lib/api';
import { CopyButton } from '../ToolCardHeader';

export function WebFetchCard({ tool, result }: { tool: Message; result?: Message }) {
  const input = (tool.toolInput as Record<string, unknown> | undefined) ?? {};
  const url = (input.url as string) || (input.query as string) || '';
  const prompt = (input.prompt as string) || '';
  const out = result?.toolOutput ?? extractOutputText(tool.toolOutput);

  return (
    <div className="space-y-2 px-3 pb-3">
      <div className="flex items-center justify-between rounded-md border border-sky-500/30 bg-sky-500/5 px-2.5 py-1 text-[11px]">
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          title={url}
          className="min-w-0 flex-1 truncate font-mono text-sky-300 hover:underline"
        >
          {url || '(no url)'}
        </a>
        <CopyButton text={url} />
      </div>
      {prompt && (
        <p className="rounded-md border border-border bg-background/30 px-2.5 py-1 text-[11px] text-muted-foreground">
          <span className="text-muted-foreground">prompt: </span>
          {prompt}
        </p>
      )}
      {out && (
        <div className="rounded-md border border-border bg-background/40">
          <div className="flex items-center justify-between border-b border-border/40 px-2.5 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            <span>response</span>
            <CopyButton text={out} />
          </div>
          <div className="md-body max-h-[400px] overflow-auto px-3 py-2 text-xs">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{out}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}
