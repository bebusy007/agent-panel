import React from "react";
import { X, Image, FileText, File } from "lucide-react";
import { formatFileSize } from "@/lib/conversation/attachment-manager";
import type { AttachmentDraft, PastedBlock } from "@/lib/conversation/attachment-manager";

interface AttachmentChipProps {
  attachment: AttachmentDraft;
  onRemove: () => void;
}

export function AttachmentChip({ attachment, onRemove }: AttachmentChipProps) {
  const Icon = getFileIcon(attachment.mediaType);

  return (
    <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-border bg-secondary/50 text-xs">
      <Icon className="w-3.5 h-3.5 text-muted-foreground" />
      <span className="text-foreground max-w-[120px] truncate">{attachment.filename}</span>
      <span className="text-muted-foreground">{formatFileSize(attachment.size)}</span>
      <button
        onClick={onRemove}
        className="ml-0.5 p-0.5 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

interface PastedBlockChipProps {
  block: PastedBlock;
  onRemove: () => void;
}

export function PastedBlockChip({ block, onRemove }: PastedBlockChipProps) {
  return (
    <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-dashed border-border bg-secondary/30 text-xs">
      <FileText className="w-3.5 h-3.5 text-muted-foreground" />
      <span className="text-foreground max-w-[150px] truncate">
        {block.ext ? `*.${block.ext}` : "pasted text"}
      </span>
      <span className="text-muted-foreground">
        {block.lineCount}L / {formatFileSize(block.charCount)}
      </span>
      <button
        onClick={onRemove}
        className="ml-0.5 p-0.5 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

function getFileIcon(mediaType: string) {
  if (mediaType.startsWith("image/")) return Image;
  if (mediaType === "application/pdf") return FileText;
  return File;
}
