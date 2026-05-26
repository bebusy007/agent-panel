import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Copy, Check, ExternalLink, FileText } from 'lucide-react';
import { COPY_FEEDBACK_LONG_MS } from '@/lib/constants';
import { api } from '@/lib/api';
import { SkillSourceBadge } from './SourceBadge';
import { formatRelative } from '@/lib/utils';
import { InPaneSearchBar, useInPaneSearch } from './InPaneSearch';
import type { Skill } from '@/lib/api';

export function SkillDetail({ id }: { id: string }) {
  const [skill, setSkill] = useState<Skill | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const search = useInPaneSearch({ containerRef: bodyRef, contentKey: skill?.id });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .skill(id)
      .then((r) => {
        if (!cancelled) setSkill('skill' in r ? r.skill : null);
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
  if (!skill) return <div className="p-6 text-sm text-muted-foreground">未找到</div>;

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 pt-3 pb-2 border-b border-border flex flex-wrap items-center gap-2">
        <SkillSourceBadge source={skill.source} full />
        <span className="text-xs text-muted-foreground">{formatRelative('')}</span>
        <div className="ml-auto flex flex-col items-end gap-2 w-full sm:w-auto sm:flex-row sm:items-center">
          <InPaneSearchBar state={search} inputId="skill-detail-search" />
        </div>
      </div>

      <div ref={bodyRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        <section className="rounded-lg border border-border bg-background/40 p-3 text-xs">
          <div className="text-muted-foreground mb-1">文件路径</div>
          <div className="flex items-start gap-2">
            <FileText className="size-3 mt-0.5 text-muted-foreground shrink-0" />
            <code className="font-mono break-all text-muted-foreground text-[11px] flex-1">
              {skill.filePath}
            </code>
            <button
              onClick={() => copy(skill.filePath)}
              className="text-muted-foreground hover:text-muted-foreground transition-colors shrink-0"
              aria-label="复制路径"
            >
              {copied === skill.filePath ? (
                <Check className="size-3 text-emerald-400" />
              ) : (
                <Copy className="size-3" />
              )}
            </button>
          </div>
          {skill.symlinkTo && (
            <div className="mt-2 flex items-start gap-2">
              <ExternalLink className="size-3 mt-0.5 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground text-[10px] uppercase tracking-wider mr-1">
                软链 →
              </span>
              <code className="font-mono break-all text-muted-foreground text-[11px] flex-1">
                {skill.symlinkTo}
              </code>
            </div>
          )}
        </section>

        {skill.triggers && skill.triggers.length > 0 && (
          <section>
            <div className="text-xs text-muted-foreground mb-1.5">触发词</div>
            <div className="flex flex-wrap gap-1.5">
              {skill.triggers.map((t) => (
                <span
                  key={t}
                  className="text-[11px] rounded bg-secondary px-2 py-0.5 text-muted-foreground"
                >
                  {t}
                </span>
              ))}
            </div>
          </section>
        )}

        {skill.cliCommands.length > 0 && (
          <section>
            <div className="text-xs text-muted-foreground mb-1.5">CLI 命令</div>
            <div className="flex flex-wrap gap-1.5">
              {skill.cliCommands.map((c) => (
                <button
                  key={c}
                  onClick={() => copy(c)}
                  className="text-[11px] font-mono rounded bg-accent/10 hover:bg-accent/20 text-accent/90 px-2 py-0.5 inline-flex items-center gap-1 transition-colors"
                  title="点击复制"
                >
                  {c}
                  {copied === c ? (
                    <Check className="size-2.5 text-emerald-400" />
                  ) : (
                    <Copy className="size-2.5 opacity-60" />
                  )}
                </button>
              ))}
            </div>
          </section>
        )}

        <section>
          <div className="text-xs text-muted-foreground mb-2">SKILL.md</div>
          <div className="md-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
              {skill.description || '*（空）*'}
            </ReactMarkdown>
          </div>
        </section>
      </div>
    </div>
  );
}
