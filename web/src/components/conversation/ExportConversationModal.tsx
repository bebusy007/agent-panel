import React, { useState, useMemo } from "react";
import { Download, FileText, Globe, X } from "lucide-react";
import type { TimelineEntry } from "@/lib/conversation/chat-session-store";
import {
  buildConversationMarkdown,
  buildConversationHtml,
  downloadTextFile,
  printHtmlAsPdf,
  type ExportFormat,
  type ExportMeta,
} from "@/lib/conversation/conversation-export";

interface ExportConversationModalProps {
  open: boolean;
  timeline: TimelineEntry[];
  meta: ExportMeta;
  onClose: () => void;
}

export function ExportConversationModal({
  open,
  timeline,
  meta,
  onClose,
}: ExportConversationModalProps) {
  const [format, setFormat] = useState<ExportFormat>("markdown");
  const [includeTools, setIncludeTools] = useState(true);
  const [includeThinking, setIncludeThinking] = useState(true);

  const filteredTimeline = useMemo(() => {
    return timeline.filter((entry) => {
      if (!includeTools && entry.kind === "tool") return false;
      return true;
    });
  }, [timeline, includeTools]);

  const markdown = useMemo(
    () => buildConversationMarkdown(filteredTimeline, meta),
    [filteredTimeline, meta]
  );

  const handleExport = () => {
    const timestamp = new Date().toISOString().slice(0, 10);
    const basename = `conversation-${timestamp}`;

    if (format === "markdown") {
      downloadTextFile(`${basename}.md`, markdown, "text/markdown");
    } else {
      const html = buildConversationHtml(markdown, meta);
      downloadTextFile(`${basename}.html`, html, "text/html");
    }
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md mx-4 rounded-xl border border-border bg-card shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Download className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Export Conversation</h2>
          <button
            onClick={onClose}
            className="ml-auto p-1 text-muted-foreground hover:text-foreground rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Format selection */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Format</label>
            <div className="flex gap-2">
              <FormatButton
                icon={<FileText className="w-4 h-4" />}
                label="Markdown"
                active={format === "markdown"}
                onClick={() => setFormat("markdown")}
              />
              <FormatButton
                icon={<Globe className="w-4 h-4" />}
                label="HTML"
                active={format === "html"}
                onClick={() => setFormat("html")}
              />
            </div>
          </div>

          {/* Options */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Include</label>
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeTools}
                  onChange={(e) => setIncludeTools(e.target.checked)}
                  className="rounded border-border"
                />
                Tool calls & results
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeThinking}
                  onChange={(e) => setIncludeThinking(e.target.checked)}
                  className="rounded border-border"
                />
                Thinking process
              </label>
            </div>
          </div>

          {/* Preview info */}
          <div className="text-xs text-muted-foreground">
            {filteredTimeline.length} entries &middot; ~{Math.round(markdown.length / 1024)} KB
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={handleExport}
              className="px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Download {format === "markdown" ? ".md" : ".html"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FormatButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:text-foreground hover:bg-secondary"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
