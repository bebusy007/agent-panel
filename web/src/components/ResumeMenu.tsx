import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { Play, Copy, Check, Terminal, MessageSquare } from "lucide-react";
import { api } from "@/lib/api";
import { copyToClipboard } from "@/lib/utils";
import type { SessionSummary, ResumeHints } from "@/lib/api";
import { COPY_FEEDBACK_LONG_MS, RESUME_MENU_WIDTH } from "@/lib/constants";

export function ResumeMenu({
  session,
  compact = false,
  onChatResume,
}: {
  session: SessionSummary;
  hints?: ResumeHints;
  compact?: boolean;
  onChatResume?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [hints, setHints] = useState<ResumeHints | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  const updatePos = useCallback(() => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const menuW = RESUME_MENU_WIDTH;
    let left = r.left;
    if (left + menuW > window.innerWidth - 8) left = window.innerWidth - 8 - menuW;
    if (left < 8) left = 8;
    setMenuPos({ top: r.bottom + 4, left });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePos();
    setLoading(true);
    api.sessionResume(session.id, "copy")
      .then((r) => { if (r.hints) setHints(r.hints); })
      .catch(() => {})
      .finally(() => setLoading(false));

    const handleClick = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      if (btnRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, session.id, updatePos]);

  const handleCopy = async (text: string, label: string) => {
    await copyToClipboard(text);
    setCopied(label);
    setTimeout(() => setCopied(null), COPY_FEEDBACK_LONG_MS);
  };

  const handleOpenTerminal = async () => {
    try {
      await api.sessionResume(session.id, "terminal");
    } catch {}
    setOpen(false);
  };

  const sourceLabel = (() => {
    switch (session.source) {
      case "claude-code": return "Claude Code";
      case "codex": return "Codex";
      case "cursor-agent":
      case "cursor-composer": return "Cursor";
      default: return session.source;
    }
  })();

  const hasCommand = hints?.terminalCommand || hints?.command;

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        ref={btnRef}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className={
          compact
            ? "inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border border-border text-muted-foreground hover:border-accent/50 hover:text-accent transition-colors"
            : "inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border border-border text-muted-foreground hover:border-accent/50 hover:text-accent transition-colors"
        }
        title="恢复此会话"
      >
        <Play className="size-3" />
        Resume
      </button>

      {open && menuPos && createPortal(
        <div
          ref={menuRef}
          className="fixed w-[380px] max-w-[calc(100vw-16px)] rounded-lg border border-border bg-card shadow-2xl z-[60] overflow-hidden animate-fade-in"
          style={{ top: menuPos.top, left: menuPos.left }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-3 py-2 border-b border-border bg-secondary/50">
            <div className="flex items-center gap-2">
              <Play className="size-3 text-accent" />
              <span className="text-xs font-medium text-foreground">恢复会话</span>
              <span className="text-[10px] text-muted-foreground">({sourceLabel})</span>
            </div>
          </div>

          {loading ? (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">加载中…</div>
          ) : !hasCommand ? (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
              该会话无可用的恢复命令
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {/* GUI chat (primary action) */}
              {onChatResume && (
                <button
                  onClick={() => { onChatResume(); setOpen(false); }}
                  className="w-full flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary hover:bg-primary/10 transition-colors"
                >
                  <MessageSquare className="size-3.5" />
                  <span className="font-medium">Continue in GUI</span>
                </button>
              )}

              {/* Terminal command (primary) */}
              {hints?.terminalCommand && (
                <div className="rounded-md border border-border bg-background/60 p-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">终端命令</span>
                    <button
                      onClick={() => handleCopy(hints.terminalCommand!, "cmd")}
                      className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {copied === "cmd" ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                      {copied === "cmd" ? "已复制" : "复制"}
                    </button>
                  </div>
                  <code className="block text-[11px] font-mono text-foreground break-all leading-relaxed select-all">
                    {hints.terminalCommand}
                  </code>
                </div>
              )}

              {/* Command only (if no terminalCommand but has command) */}
              {!hints?.terminalCommand && hints?.command && (
                <div className="rounded-md border border-border bg-background/60 p-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">命令</span>
                    <button
                      onClick={() => handleCopy(hints.command!, "cmd")}
                      className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {copied === "cmd" ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                      {copied === "cmd" ? "已复制" : "复制"}
                    </button>
                  </div>
                  <code className="block text-[11px] font-mono text-foreground break-all leading-relaxed select-all">
                    {hints.command}
                  </code>
                </div>
              )}

              {/* CWD */}
              {session.cwd && (
                <div className="rounded-md border border-border bg-background/60 p-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">工作目录</span>
                    <button
                      onClick={() => handleCopy(session.cwd!, "cwd")}
                      className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {copied === "cwd" ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                      {copied === "cwd" ? "已复制" : "复制"}
                    </button>
                  </div>
                  <code className="block text-[11px] font-mono text-muted-foreground break-all leading-relaxed select-all">
                    {session.cwd}
                  </code>
                </div>
              )}

              {/* Open in terminal button */}
              {hints?.terminalCommand && (
                <button
                  onClick={handleOpenTerminal}
                  className="w-full flex items-center justify-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors mt-1"
                >
                  <Terminal className="size-3" />
                  在终端中打开
                </button>
              )}
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
