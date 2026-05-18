import { useMemo } from "react";
import { extractOutputText } from "@/lib/tool-rendering";
import { ansiToHtml, hasAnsiCodes, stripAnsi } from "@/lib/ansi";
import type { Message } from "@/lib/api";
import { CopyButton } from "../ToolCardHeader";

const ANSI_SIZE_LIMIT = 200_000;

export function BashCard({ tool, result }: { tool: Message; result?: Message }) {
  const input = (tool.toolInput as Record<string, unknown> | undefined) ?? {};
  // Claude/Cursor/Codex all use slightly different field names for the
  // command — try them in order of likelihood.
  const command =
    (typeof input.command === "string" && input.command) ||
    (typeof input.cmd === "string" && (input.cmd as string)) ||
    "";
  const description = typeof input.description === "string" ? (input.description as string) : "";
  const output = result?.toolOutput ?? extractOutputText(tool.toolOutput);

  // Try to also surface stdout/stderr/exit_code from a structured result.
  const structured = useMemo(() => {
    const tur = (result?.raw as Record<string, unknown> | undefined)?.tool_use_result as
      | { stdout?: string; stderr?: string; interrupted?: boolean; exit_code?: number; exitCode?: number }
      | undefined;
    return tur;
  }, [result]);

  const outHtml = useMemo(() => renderOutput(output), [output]);

  return (
    <div className="space-y-1 px-3 pb-3">
      {description && (
        <p className="text-[11px] text-muted-foreground">{description}</p>
      )}
      <div className="rounded-md border border-[var(--terminal-cmd-border)] bg-[var(--terminal-bg)]">
        <div className="flex items-center justify-between border-b border-[var(--terminal-cmd-border-b)] px-2.5 py-1 text-[10px] uppercase tracking-wider text-[var(--terminal-cmd-label)]">
          <span>$ command</span>
          <CopyButton text={command} />
        </div>
        <pre className="overflow-auto px-2.5 py-1.5 font-mono text-[11px] leading-snug text-[var(--terminal-cmd-text)]">
          {command || <span className="italic text-muted-foreground">(空命令)</span>}
        </pre>
      </div>
      {(output || structured) && (
        <div className="rounded-md border border-[var(--terminal-border)] bg-[var(--terminal-bg)]">
          <div className="flex items-center justify-between border-b border-[var(--terminal-border)] px-2.5 py-1 text-[10px] uppercase tracking-wider text-[var(--terminal-fg)]/60">
            <span>output</span>
            <div className="flex items-center gap-2 text-[10px]">
              {structured?.exit_code !== undefined && (
                <span className={structured.exit_code === 0 ? "text-emerald-400" : "text-red-400"}>
                  exit {structured.exit_code}
                </span>
              )}
              {structured?.interrupted && (
                <span className="text-amber-400">interrupted</span>
              )}
              <CopyButton text={stripAnsi(output)} />
            </div>
          </div>
          <pre
            className="max-h-[400px] overflow-auto whitespace-pre-wrap break-all px-2.5 py-1.5 font-mono text-[11px] leading-snug text-[var(--terminal-fg)]"
            dangerouslySetInnerHTML={{ __html: outHtml || "(空)" }}
          />
        </div>
      )}
    </div>
  );
}

function renderOutput(out: string): string {
  if (!out) return "";
  if (out.length > ANSI_SIZE_LIMIT) {
    return escape(stripAnsi(out));
  }
  if (hasAnsiCodes(out)) {
    try {
      return ansiToHtml(out);
    } catch {
      return escape(stripAnsi(out));
    }
  }
  return escape(out);
}

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
