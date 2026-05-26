import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Bot, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { useCachedAsync } from '@/lib/hooks';
import { useDetailNav } from '@/lib/use-detail-nav';

/**
 * Standalone Agent detail page. Replaces the in-place AgentDrawer
 * that used to live in ExtensionsView so all detail surfaces (skill,
 * mcp, agent, session) behave the same way: real route, real
 * browser back, no overlay-on-overlay.
 *
 * Data: there's no single-agent server endpoint — the list response
 * already includes full body / meta — so we reuse the cached
 * `agents:list` and `find` by id. Cached fetch means revisiting an
 * agent doesn't re-fetch a few hundred KB of JSON.
 */
export default function AgentDetailView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { goBack } = useDetailNav('/extensions?section=agents');
  const { data, loading, error } = useCachedAsync('agents:list', () => api.agents(), []);
  const agent = data?.agents.find((a) => a.name === id);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background px-4">
        <button
          onClick={goBack}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-fg"
          title="返回"
        >
          <ArrowLeft className="size-3.5" />
          返回
        </button>
        <ChevronRight className="size-3 text-muted-foreground" />
        <button
          onClick={() => navigate('/extensions?section=agents')}
          className="text-xs text-muted-foreground hover:text-fg transition-colors"
        >
          扩展 / Agents
        </button>
        <ChevronRight className="size-3 text-muted-foreground" />
        <span className="truncate text-xs font-medium text-fg">{agent?.name ?? id}</span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[960px] px-6 py-6">
          {loading && !data ? (
            <div className="py-12 text-center text-sm text-muted-foreground">加载中…</div>
          ) : error ? (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
              加载失败：{error.message}
            </div>
          ) : !agent ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              未找到 agent: <code className="font-mono">{id}</code>
            </div>
          ) : (
            <article className="space-y-4">
              {/* Title block */}
              <header className="space-y-2">
                <div className="flex items-center gap-2">
                  <Bot className="size-5 text-purple-400" />
                  <h1 className="typo-h1 text-fg">{agent.name}</h1>
                </div>
                {agent.description && (
                  <p className="text-sm text-muted-foreground">{agent.description}</p>
                )}
                <div className="font-mono text-[11px] text-muted-foreground">{agent.filePath}</div>
              </header>

              {/* Meta chips */}
              <div className="flex flex-wrap gap-1.5 text-[11px]"></div>

              {/* Body */}
              <section className="rounded-lg border border-border bg-card p-4">
                <div className="mb-2 typo-label">正文</div>
                <pre className="whitespace-pre-wrap break-words font-mono text-[12.5px] leading-relaxed text-fg">
                  {agent.description || '(空)'}
                </pre>
              </section>
            </article>
          )}
        </div>
      </div>
    </div>
  );
}
