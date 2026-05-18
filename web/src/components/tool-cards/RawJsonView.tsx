import { useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { copyToClipboard } from "@/lib/utils";
import { COPY_FEEDBACK_MS } from "@/lib/constants";

/**
 * Two-pane raw view: left = input JSON, right = result JSON. Used by
 * every ToolCard's "原始" tab so you can always see exactly what the
 * agent emitted, regardless of how cleverly the pretty card mangled it.
 */
export function RawJsonView({
  input,
  output,
  raw,
}: {
  input?: unknown;
  output?: unknown;
  /** Optional: the original message.raw payload (debug-only fallback). */
  raw?: unknown;
}) {
  const inputStr = useMemo(() => safeStringify(input), [input]);
  const outputStr = useMemo(() => safeStringify(output), [output]);
  const rawStr = useMemo(() => (raw === undefined ? "" : safeStringify(raw)), [raw]);

  return (
    <div className="space-y-2">
      {input !== undefined && (
        <Block title="Input" content={inputStr} />
      )}
      {output !== undefined && output !== null && output !== "" && (
        <Block title="Output" content={outputStr} />
      )}
      {raw !== undefined && (
        <details className="rounded-md border border-border bg-background/40">
          <summary className="cursor-pointer px-2.5 py-1 text-[11px] text-muted-foreground hover:text-muted-foreground">
            完整原始 payload
          </summary>
          <Block title="Raw" content={rawStr} bare />
        </details>
      )}
    </div>
  );
}

function Block({ title, content, bare }: { title: string; content: string; bare?: boolean }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    await copyToClipboard(content);
    setCopied(true);
    setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
  };
  return (
    <div className={bare ? "" : "rounded-md border border-border bg-background/40"}>
      <div className="flex items-center justify-between px-2.5 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>{title}</span>
        <button
          onClick={onCopy}
          className="inline-flex items-center gap-0.5 hover:text-muted-foreground"
          title="复制"
        >
          {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
        </button>
      </div>
      <pre className="max-h-[400px] overflow-auto whitespace-pre-wrap break-all px-2.5 pb-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
        {content || <span className="text-muted-foreground italic">(empty)</span>}
      </pre>
    </div>
  );
}

function safeStringify(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}
