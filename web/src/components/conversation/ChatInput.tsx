import React, { useState, useRef, useCallback, useEffect } from "react";
import { Send, Square, Loader2 } from "lucide-react";
import { useSession } from "@/components/session/SessionContext";
import { SlashMenu } from "./SlashMenu";

export function ChatInput() {
  const { chat } = useSession();
  const { state, connectionState, sendMessage, interrupt } = chat;
  const isRunning = state.phase === "running";
  const isConnecting = connectionState === "connecting";

  const [text, setText] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [slashQuery, setSlashQuery] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [text]);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    sendMessage(trimmed);
    setHistory((prev) => [...prev, trimmed]);
    setHistoryIndex(-1);
    setText("");
    setSlashQuery(null);
  }, [text, sendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        handleSend();
        return;
      }
      if (e.key === "Escape") {
        if (slashQuery !== null) {
          setSlashQuery(null);
        } else if (isRunning) {
          interrupt();
        }
        return;
      }
      // History navigation
      if (e.key === "ArrowUp" && text === "" && history.length > 0) {
        e.preventDefault();
        const newIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIndex);
        setText(history[newIndex]);
      }
      if (e.key === "ArrowDown" && historyIndex !== -1) {
        e.preventDefault();
        if (historyIndex >= history.length - 1) {
          setHistoryIndex(-1);
          setText("");
        } else {
          setHistoryIndex(historyIndex + 1);
          setText(history[historyIndex + 1]);
        }
      }
    },
    [text, history, historyIndex, handleSend, isRunning, interrupt, slashQuery]
  );

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);
    setHistoryIndex(-1);
    if (val.startsWith("/")) {
      setSlashQuery(val.slice(1));
    } else {
      setSlashQuery(null);
    }
  }, []);

  const handleSlashSelect = useCallback((cmd: string) => {
    setText(cmd);
    setSlashQuery(null);
    // Auto-send slash commands
    sendMessage(cmd);
    setText("");
  }, [sendMessage]);

  return (
    <div className="shrink-0 border-t border-border bg-background relative">
      {/* Slash menu popup */}
      {slashQuery !== null && (
        <SlashMenu
          query={slashQuery}
          commands={state.slashCommands}
          onSelect={handleSlashSelect}
          onClose={() => setSlashQuery(null)}
        />
      )}

      {/* Connecting indicator */}
      {isConnecting && (
        <div className="flex items-center gap-2 px-4 py-1.5 text-xs text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" />
          Connecting...
        </div>
      )}

      {/* Error display */}
      {state.error && (
        <div className="px-4 py-1.5 text-xs text-destructive bg-destructive/5">
          {state.error}
        </div>
      )}

      {/* Input area */}
      <div className="flex items-end gap-2 px-4 py-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={isRunning ? "Type to send next (queued)..." : "Type a message... (Enter to send)"}
          rows={1}
          className="flex-1 resize-none rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring min-h-[36px] max-h-[160px]"
        />

        {/* Send button (always shown when text present) */}
        {text.trim() && (
          <button
            onClick={handleSend}
            className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            title="Send (Enter)"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Stop button (shown when running) */}
        {isRunning && (
          <button
            onClick={interrupt}
            className="flex items-center justify-center w-8 h-8 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
            title="Stop (Esc)"
          >
            <Square className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Status line */}
      {state.model && (
        <div className="flex items-center gap-2 px-4 pb-1.5 text-[11px] text-muted-foreground">
          <span>{formatModel(state.model)}</span>
          {state.usage.inputTokens > 0 && (
            <span className="tabular-nums">
              {formatK(state.usage.inputTokens)}↓ {formatK(state.usage.outputTokens)}↑
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function formatModel(m: string): string {
  if (m.includes("opus")) return "Opus";
  if (m.includes("sonnet")) return "Sonnet";
  if (m.includes("haiku")) return "Haiku";
  return m.split("-").slice(0, 2).join("-");
}

function formatK(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}
