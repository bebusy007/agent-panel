import React, { useState, useRef, useCallback, useEffect } from "react";
import { Send, Square } from "lucide-react";
import type { AttachmentData } from "@/lib/conversation/chat-protocol";

interface ConversationPromptProps {
  isConnected: boolean;
  isRunning: boolean;
  hasPendingPermission: boolean;
  onSend: (text: string, attachments?: AttachmentData[]) => void;
  onInterrupt: () => void;
  onConnect: () => void;
  onSlashTrigger?: (query: string) => void;
  onSlashClose?: () => void;
  disabled?: boolean;
}

export function ConversationPrompt({
  isConnected,
  isRunning,
  hasPendingPermission,
  onSend,
  onInterrupt,
  onConnect,
  onSlashTrigger,
  onSlashClose,
  disabled,
}: ConversationPromptProps) {
  const [text, setText] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [text]);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;

    onSend(trimmed);
    setHistory((prev) => [...prev, trimmed]);
    setHistoryIndex(-1);
    setDraft("");
    setText("");
  }, [text, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter to send (without Shift)
      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        handleSend();
        return;
      }

      // Esc to interrupt
      if (e.key === "Escape") {
        if (isRunning) {
          onInterrupt();
        }
        onSlashClose?.();
        return;
      }

      // History navigation
      if (e.key === "ArrowUp" && text === "" && history.length > 0) {
        e.preventDefault();
        const newIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
        if (historyIndex === -1) setDraft(text);
        setHistoryIndex(newIndex);
        setText(history[newIndex]);
        return;
      }

      if (e.key === "ArrowDown" && historyIndex !== -1) {
        e.preventDefault();
        if (historyIndex >= history.length - 1) {
          setHistoryIndex(-1);
          setText(draft);
        } else {
          const newIndex = historyIndex + 1;
          setHistoryIndex(newIndex);
          setText(history[newIndex]);
        }
        return;
      }
    },
    [text, history, historyIndex, draft, handleSend, isRunning, onInterrupt, onSlashClose]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setText(value);
      setHistoryIndex(-1);

      // Slash command detection
      if (value.startsWith("/")) {
        onSlashTrigger?.(value.slice(1));
      } else {
        onSlashClose?.();
      }
    },
    [onSlashTrigger, onSlashClose]
  );

  // Not connected: show connect button
  if (!isConnected) {
    return (
      <div className="border-t border-border px-4 py-3">
        <button
          onClick={onConnect}
          disabled={disabled}
          className="w-full h-9 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          ▶ Connect and continue
        </button>
      </div>
    );
  }

  // Permission pending hint
  if (hasPendingPermission) {
    return (
      <div className="border-t border-border px-4 py-3">
        <div className="flex items-center justify-center h-9 rounded-lg bg-secondary text-muted-foreground text-sm">
          Awaiting permission response...
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-border px-4 py-3">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          rows={1}
          className="flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-[36px] max-h-[200px]"
        />

        {/* Send or Stop button */}
        {isRunning && !text.trim() ? (
          <button
            onClick={onInterrupt}
            className="flex items-center justify-center w-9 h-9 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
            title="Stop (Esc)"
          >
            <Square className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!text.trim()}
            className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Send (Enter)"
          >
            <Send className="w-4 h-4" />
          </button>
        )}

        {/* Stop button always visible when running AND has text */}
        {isRunning && text.trim() && (
          <button
            onClick={onInterrupt}
            className="flex items-center justify-center w-9 h-9 rounded-lg bg-destructive/20 text-destructive hover:bg-destructive/30 transition-colors"
            title="Stop (Esc)"
          >
            <Square className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
