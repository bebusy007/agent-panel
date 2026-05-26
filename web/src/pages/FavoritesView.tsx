import { useEffect, useState, useCallback } from 'react';
import { Star, Trash2, ExternalLink, Check, FolderOpen } from 'lucide-react';
import { api, type RustFavoriteItem } from '@/lib/api';
import { useOverlayNavigate } from '@/lib/use-detail-nav';
import { formatRelative, cn, describeSessionSource, sourceColor } from '@/lib/utils';
import { MessageBlock } from '@/components/session/MessageBlock';

export default function FavoritesView() {
  const [items, setItems] = useState<RustFavoriteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const openOverlay = useOverlayNavigate();

  const reload = async () => {
    setLoading(true);
    try {
      const d = await api.favoritesList();
      setItems(d.favorites);
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
    setTimeout(() => setToast(null), 1500);
  };

  const handleRemove = async (item: RustFavoriteItem) => {
    await api.favoritesRemove(item.id);
    setItems((prev) => prev.filter((x) => x.id !== item.id));
    flash('已取消收藏');
  };

  const handleJump = (item: RustFavoriteItem) => {
    openOverlay(
      `/sessions/${encodeURIComponent(item.sessionId)}?msg=${encodeURIComponent(item.messageId)}`,
    );
  };

  const toggleExpanded = useCallback((msgId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);
      return next;
    });
  }, []);

  return (
    <div className="space-y-6 animate-fade-in">
      <header>
        <h1 className="typo-h1 flex items-center gap-2">
          <Star className="size-5 text-amber-400 fill-amber-400" /> 收藏
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          共 <span className="text-foreground">{items.length}</span> 条收藏
        </p>
      </header>

      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error.message}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">加载中…</div>
      ) : items.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center">
          还没有收藏。在 Session 详情页点击消息旁的 ☆ 即可收藏。
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <FavoriteCard
              key={item.id}
              item={item}
              expanded={expandedIds.has(item.messageId)}
              onToggleExpand={() => toggleExpanded(item.messageId)}
              onJump={handleJump}
              onRemove={handleRemove}
            />
          ))}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 inline-flex items-center gap-2 rounded-md border border-border bg-secondary px-4 py-2 text-sm shadow-lg">
          <Check className="size-3.5 text-emerald-400" /> {toast}
        </div>
      )}
    </div>
  );
}

function FavoriteCard({
  item,
  expanded,
  onToggleExpand,
  onJump,
  onRemove,
}: {
  item: RustFavoriteItem;
  expanded: boolean;
  onToggleExpand: () => void;
  onJump: (item: RustFavoriteItem) => void;
  onRemove: (item: RustFavoriteItem) => void;
}) {
  const m = item.message;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Session context header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border/50 bg-muted/30">
        {item.sessionSource && (
          <span
            className={cn(
              'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] ring-1 ring-inset font-medium shrink-0',
              sourceColor(item.sessionSource),
            )}
          >
            {describeSessionSource(item.sessionSource)}
          </span>
        )}
        <span className="text-xs text-foreground truncate flex-1 min-w-0">
          {item.sessionTitle || `session: ${item.sessionId.slice(0, 12)}…`}
        </span>
        {item.sessionCwd && (
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
            <FolderOpen className="size-3" />
            {item.sessionCwd.replace(/^\/Users\/[^/]+/, '~')}
          </span>
        )}
        <span className="text-[10px] text-muted-foreground shrink-0">
          {formatRelative(item.createdAt)}
        </span>
      </div>

      {/* Message body — reuse the real MessageBlock from session detail */}
      {m ? (
        <div className="px-3 py-3">
          <MessageBlock
            m={m}
            sessionId={item.sessionId}
            expanded={expanded}
            searchActive={false}
            onToggle={onToggleExpand}
            favorited={true}
            onToggleFav={() => onRemove(item)}
          />
        </div>
      ) : (
        <div className="px-4 py-4 text-xs text-muted-foreground italic">
          消息内容不可用（会话可能已被删除）
        </div>
      )}

      {/* Footer actions */}
      <div className="flex items-center gap-2 px-4 py-2 border-t border-border/50">
        <button
          onClick={() => onJump(item)}
          className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded border border-border text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors"
        >
          <ExternalLink className="size-3" /> 跳转到会话
        </button>
        <button
          onClick={() => onRemove(item)}
          className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded border border-red-500/30 text-red-300 hover:bg-red-500/10 transition-colors ml-auto"
        >
          <Trash2 className="size-3" /> 取消收藏
        </button>
      </div>
    </div>
  );
}
