import { useMemo } from 'react';
import hljs from 'highlight.js';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getLanguageFromPath, shortenPath } from '@/lib/tool-rendering';
import type { Message } from '@/lib/api';
import { CopyButton } from '../ToolCardHeader';

export function WriteCard({ tool }: { tool: Message; result?: Message }) {
  const input = (tool.toolInput as Record<string, unknown> | undefined) ?? {};
  const filePath =
    (input.file_path as string) || (input.path as string) || (input.filePath as string) || '';
  const lang = getLanguageFromPath(filePath);
  const content = typeof input.content === 'string' ? input.content : '';
  const isMd = lang === 'markdown';

  const html = useMemo(() => {
    if (!content) return '';
    if (!lang || !hljs.getLanguage(lang)) return escape(content);
    try {
      return hljs.highlight(content, { language: lang }).value;
    } catch {
      return escape(content);
    }
  }, [content, lang]);

  return (
    <div className="space-y-1 px-3 pb-3">
      <div className="flex items-center justify-between rounded-md border border-border bg-secondary/50 px-2.5 py-1 text-[11px]">
        <span className="font-mono text-muted-foreground" title={filePath}>
          {shortenPath(filePath) || '(no path)'}
        </span>
        <div className="flex items-center gap-2 text-muted-foreground">
          <span className="tabular-nums">
            {content.split('\n').length} 行 · {content.length}b
          </span>
          <CopyButton text={content} />
        </div>
      </div>
      {!content ? (
        <p className="text-[11px] italic text-muted-foreground">(空内容)</p>
      ) : isMd ? (
        <div className="prose-sm max-w-none rounded-md border border-border bg-background/40 p-3 text-sm md-body">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      ) : (
        <pre
          className="overflow-auto rounded-md border border-border bg-background/60 p-2 font-mono text-[11px] leading-snug text-muted-foreground"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </div>
  );
}

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
