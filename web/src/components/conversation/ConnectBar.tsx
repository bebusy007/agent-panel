import { useState, useCallback, useRef, useEffect } from 'react';
import { Send, Square, Loader2, Play, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SessionPhase } from '@/lib/conversation/chat-session-store';

interface ConnectBarProps {
  phase: SessionPhase;
  error: string | null;
  /** Can the user type input (not during connecting/disconnecting) */
  canInput: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onCancelConnect: () => void;
  onRetry: () => void;
  onSend: (text: string) => void;
  onStop: () => void;
}

export function ConnectBar({
  phase,
  error,
  canInput,
  onConnect,
  onDisconnect,
  onCancelConnect,
  onRetry,
  onSend,
  onStop,
}: ConnectBarProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isRunning = phase === 'running';

  // Auto-focus textarea when connected
  useEffect(() => {
    if (phase === 'connected' || phase === 'idle') {
      textareaRef.current?.focus();
    }
  }, [phase]);

  // Auto-resize textarea
  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const lineHeight = 24;
    const maxHeight = lineHeight * 6; // max 6 lines (~30% viewport)
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [text, adjustHeight]);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
    // Reset height after clearing
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    } else if (e.key === 'Escape') {
      if (isRunning) {
        e.preventDefault();
        onStop();
      }
    }
  };

  // ── Offline state ──
  if (phase === 'empty' || phase === 'disconnected') {
    return (
      <div className="flex items-center justify-center px-4 py-4 border-t border-border">
        <button
          onClick={onConnect}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-accent text-accent-foreground text-sm font-medium hover:bg-accent/90 transition-colors"
        >
          <Play className="size-4" />
          连接并继续对话
        </button>
      </div>
    );
  }

  // ── Connecting state ──
  if (phase === 'connecting') {
    return (
      <div className="flex items-center justify-center gap-3 px-4 py-4 border-t border-border">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">连接中...</span>
        <button
          onClick={onCancelConnect}
          className="text-xs text-muted-foreground hover:text-muted-foreground transition-colors"
        >
          取消
        </button>
      </div>
    );
  }

  // ── Error state ──
  if (phase === 'error') {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-4 border-t border-border">
        <div className="flex items-center gap-2 text-sm text-red-400">
          <X className="size-4" />
          连接失败{error ? `：${error}` : ''}
        </div>
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:text-fg hover:border-border transition-colors"
        >
          <Loader2 className="size-3" />
          重试
        </button>
      </div>
    );
  }

  // ── Connected / Idle / Running state ──
  return (
    <div className="flex items-end gap-2 px-4 py-3 border-t border-border bg-background">
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="输入消息... (Enter 发送, Shift+Enter 换行, Esc 停止)"
        disabled={!canInput}
        rows={1}
        className={cn(
          'flex-1 resize-none rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none',
          'focus:border-border focus:ring-1 focus:ring-accent/30',
          'placeholder:text-muted-foreground',
          !canInput && 'opacity-50 cursor-not-allowed',
        )}
      />
      <div className="flex items-center gap-1.5 shrink-0">
        {isRunning && (
          <button
            onClick={onStop}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 text-sm font-medium transition-colors"
            title="停止生成 (Esc)"
          >
            <Square className="size-3.5 fill-current" />
            停止
          </button>
        )}
        <button
          onClick={handleSend}
          disabled={!text.trim()}
          className={cn(
            'inline-flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
            isRunning
              ? 'bg-secondary text-muted-foreground hover:bg-secondary/80'
              : 'bg-accent text-accent-foreground hover:bg-accent/90',
            !text.trim() && 'opacity-50 cursor-not-allowed',
          )}
          title="发送 (Enter)"
        >
          <Send className="size-3.5" />
          发送
        </button>
        <button
          onClick={onDisconnect}
          className="px-2 py-2 rounded-lg text-muted-foreground hover:text-muted-foreground hover:bg-secondary text-xs transition-colors"
          title="断开连接"
        >
          断开
        </button>
      </div>
    </div>
  );
}
