import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, RotateCcw, Trash2, Check } from 'lucide-react';
import { api } from '@/lib/api';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { formatBytes, cn } from '@/lib/utils';

interface TrashItem {
  path: string;
  project: string;
  sizeBytes: number;
}

export default function SessionsTrashView() {
  const [entries, setEntries] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<{
    title: string;
    description: React.ReactNode;
    requireType?: string;
    tone?: 'default' | 'danger';
    onConfirm: (cascadeIds: string[]) => Promise<void>;
  } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    try {
      const d = await api.trashList();
      setEntries(d.items);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  };
  const totalBytes = entries.reduce((s, e) => s + (e.sizeBytes || 0), 0);

  const handleRestore = async (paths: string[]) => {
    const r = await api.sessionsRestore(paths);
    flash(
      `已恢复 ${r.restored.length}/${paths.length}${r.errors.length ? `，失败 ${r.errors.length}` : ''}`,
    );
    setSelected(new Set());
    reload();
  };

  const handlePermanent = async (paths: string[]) => {
    setConfirm({
      title: `永久删除 ${paths.length} 条`,
      description: <>将永久删除 {paths.length} 条会话文件，无法恢复。</>,
      requireType: '删除',
      tone: 'danger',
      onConfirm: async () => {
        const r = await api.sessionsPermanentDelete(paths);
        flash(
          `已永久删除 ${r.deleted.length}/${paths.length}${r.errors.length ? `，失败 ${r.errors.length}` : ''}`,
        );
        setSelected(new Set());
        reload();
      },
    });
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <Link
            to="/sessions"
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-1"
          >
            <ArrowLeft className="size-3" /> 返回
          </Link>
          <h1 className="typo-h1">回收站</h1>
          <p className="text-sm text-muted-foreground mt-1">
            共 <span className="text-foreground">{entries.length}</span> 条，占用{' '}
            <span className="text-foreground">{formatBytes(totalBytes)}</span>
          </p>
        </div>
      </header>

      {selected.size > 0 && (
        <div className="sticky top-0 z-10 flex items-center gap-3 rounded-lg border border-primary/40 bg-primary/10 px-4 py-2 backdrop-blur">
          <span className="text-sm font-medium">已选 {selected.size} 条</span>
          <button
            onClick={() => handleRestore(Array.from(selected))}
            className="text-xs px-2.5 py-1 rounded border border-border text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <RotateCcw className="size-3" /> 恢复
          </button>
          <button
            onClick={() => handlePermanent(Array.from(selected))}
            className="text-xs px-2.5 py-1 rounded border border-red-500/30 text-red-300 hover:bg-red-500/10 inline-flex items-center gap-1"
          >
            <Trash2 className="size-3" /> 永久删除
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto text-xs text-muted-foreground hover:text-foreground"
          >
            取消选择
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error.message}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">加载中…</div>
      ) : entries.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center">回收站是空的</div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-2">
            <input
              type="checkbox"
              checked={selected.size === entries.length}
              onChange={(e) => {
                if (e.target.checked) setSelected(new Set(entries.map((x) => x.path)));
                else setSelected(new Set());
              }}
              className="size-3.5 accent-[var(--primary)]"
            />
            <span className="text-[11px] text-muted-foreground">全选</span>
          </div>
          {entries.map((e) => {
            const sel = selected.has(e.path);
            const fileName = e.path.split('/').pop() || e.path;
            return (
              <div
                key={e.path}
                className={cn(
                  'flex items-stretch gap-3 rounded-lg border bg-card px-4 py-3',
                  sel ? 'border-primary/60 bg-primary/5' : 'border-border',
                )}
              >
                <input
                  type="checkbox"
                  checked={sel}
                  onChange={() =>
                    setSelected((s) => {
                      const next = new Set(s);
                      next.has(e.path) ? next.delete(e.path) : next.add(e.path);
                      return next;
                    })
                  }
                  className="size-4 mt-0.5 accent-[var(--primary)] cursor-pointer"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">
                      {fileName.replace('.jsonl.trash', '')}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    项目: {e.project} · {formatBytes(e.sizeBytes)}
                  </div>
                  <div
                    className="mt-0.5 text-[10px] font-mono text-muted-foreground truncate"
                    title={e.path}
                  >
                    {e.path}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleRestore([e.path])}
                    className="text-xs px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                    title="恢复"
                  >
                    <RotateCcw className="size-3" /> 恢复
                  </button>
                  <button
                    onClick={() => handlePermanent([e.path])}
                    className="text-xs px-2 py-1 rounded border border-red-500/30 text-red-300 hover:bg-red-500/10 inline-flex items-center gap-1"
                    title="永久删除"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {confirm && (
        <ConfirmDialog
          open={!!confirm}
          onClose={() => setConfirm(null)}
          onConfirm={async (cascadeIds) => {
            await confirm.onConfirm(cascadeIds);
            setConfirm(null);
          }}
          title={confirm.title}
          description={confirm.description}
          requireType={confirm.requireType}
          tone={confirm.tone}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 inline-flex items-center gap-2 rounded-md border border-border bg-secondary px-4 py-2 text-sm shadow-lg">
          <Check className="size-3.5 text-emerald-400" /> {toast}
        </div>
      )}
    </div>
  );
}
