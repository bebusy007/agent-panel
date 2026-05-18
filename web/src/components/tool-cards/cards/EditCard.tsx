import { useMemo } from "react";
import { structuredPatch } from "diff";
import hljs from "highlight.js";
import { getLanguageFromPath, shortenPath } from "@/lib/tool-rendering";
import type { Message } from "@/lib/api";
import { EDIT_TAIL_MAX_LEN } from "@/lib/constants";
import { CopyButton } from "../ToolCardHeader";

interface Props {
  tool: Message;
  result?: Message;
}

interface Hunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

/** Render a unified diff with proper line numbers and per-line +/- coloring.
 *  Works for both single Edit (old_string + new_string) and MultiEdit (edits[]).*/
export function EditCard({ tool, result }: Props) {
  const input = (tool.toolInput as Record<string, unknown> | undefined) ?? {};
  const filePath =
    (input.file_path as string) ||
    (input.path as string) ||
    (input.filePath as string) ||
    "";
  const lang = getLanguageFromPath(filePath);

  const hunks = useMemo(() => buildHunks(input), [input]);
  const tail = extractTailText(result);

  return (
    <div className="space-y-1 px-3 pb-3">
      <div className="flex items-center justify-between rounded-md border border-border bg-secondary/50 px-2.5 py-1 text-[11px]">
        <span className="font-mono text-muted-foreground" title={filePath}>
          {shortenPath(filePath) || "(no path)"}
        </span>
        <div className="flex items-center gap-2 text-muted-foreground">
          <span className="tabular-nums">{hunks.length} hunk(s)</span>
          {hunks.length > 0 && (
            <CopyButton text={hunksToString(hunks)} label="复制 diff" />
          )}
        </div>
      </div>
      {hunks.length === 0 ? (
        <p className="text-[11px] italic text-muted-foreground">无可解析的 diff（输入缺 old_string/new_string）</p>
      ) : (
        <div className="overflow-auto rounded-md border border-border bg-background/60 font-mono text-[11px] leading-snug">
          {hunks.map((h, i) => (
            <DiffHunkView key={i} hunk={h} lang={lang} />
          ))}
        </div>
      )}
      {tail && (
        <details className="rounded-md border border-border bg-background/40">
          <summary className="cursor-pointer px-2.5 py-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-muted-foreground">
            tool_result
          </summary>
          <pre className="max-h-[200px] overflow-auto whitespace-pre-wrap break-words px-2.5 pb-2 font-mono text-[11px] text-muted-foreground">{tail}</pre>
        </details>
      )}
    </div>
  );
}

function DiffHunkView({ hunk, lang }: { hunk: Hunk; lang: string }) {
  // Highlight the whole hunk as a single block so multi-line constructs
  // (block comments, template strings) survive.
  const cleanLines = hunk.lines.map(stripPrefix);
  const highlighted = useMemo(() => {
    if (!lang || !hljs.getLanguage(lang)) return cleanLines.map(escape);
    try {
      return hljs.highlight(cleanLines.join("\n"), { language: lang }).value.split("\n");
    } catch {
      return cleanLines.map(escape);
    }
  }, [cleanLines, lang]);

  let oldLine = hunk.oldStart;
  let newLine = hunk.newStart;
  return (
    <table className="w-full border-collapse">
      <tbody>
        {hunk.lines.map((raw, i) => {
          const content = highlighted[i] ?? escape(cleanLines[i]);
          const sign = raw[0];
          const oldNum = sign === "+" ? "" : oldLine++;
          const newNum = sign === "-" ? "" : newLine++;
          const rowCls =
            sign === "+"
              ? "bg-emerald-500/10 text-emerald-200"
              : sign === "-"
                ? "bg-red-500/10 text-red-200"
                : "text-muted-foreground";
          return (
            <tr key={i} className={rowCls}>
              <td className="w-10 select-none whitespace-nowrap border-r border-border/40 bg-background/30 px-1.5 py-px text-right text-muted-foreground tabular-nums">
                {oldNum}
              </td>
              <td className="w-10 select-none whitespace-nowrap border-r border-border/40 bg-background/30 px-1.5 py-px text-right text-muted-foreground tabular-nums">
                {newNum}
              </td>
              <td className="w-3 select-none px-1 text-center">
                {sign === "+" ? (
                  <span className="text-emerald-400">+</span>
                ) : sign === "-" ? (
                  <span className="text-red-400">−</span>
                ) : (
                  " "
                )}
              </td>
              <td
                className="whitespace-pre-wrap break-all px-2 py-px"
                dangerouslySetInnerHTML={{ __html: content || "&nbsp;" }}
              />
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function buildHunks(input: Record<string, unknown>): Hunk[] {
  // MultiEdit: edits: [{ old_string, new_string }, ...]
  const edits = Array.isArray(input.edits) ? (input.edits as Array<Record<string, unknown>>) : null;
  if (edits) {
    const all: Hunk[] = [];
    for (const e of edits) {
      const h = oneEditToHunks(String(e.old_string ?? ""), String(e.new_string ?? ""));
      all.push(...h);
    }
    return all;
  }
  // Edit
  const oldStr = typeof input.old_string === "string" ? input.old_string : undefined;
  const newStr = typeof input.new_string === "string" ? input.new_string : undefined;
  if (oldStr !== undefined && newStr !== undefined) {
    return oneEditToHunks(oldStr, newStr);
  }
  // Cursor edit_file: shape varies — try `code_edit` / `instructions`.
  // We don't have enough info to build a real diff; return empty so the
  // header still shows + RawJsonView remains useful.
  return [];
}

function oneEditToHunks(oldStr: string, newStr: string): Hunk[] {
  const patch = structuredPatch("", "", oldStr, newStr, "", "", { context: 3 });
  return patch.hunks.map((h) => ({
    oldStart: h.oldStart,
    oldLines: h.oldLines,
    newStart: h.newStart,
    newLines: h.newLines,
    lines: h.lines,
  }));
}

function stripPrefix(line: string): string {
  if (line.startsWith("+") || line.startsWith("-") || line.startsWith(" ")) return line.slice(1);
  return line;
}

function hunksToString(hunks: Hunk[]): string {
  return hunks
    .map(
      (h) =>
        `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@\n` + h.lines.join("\n"),
    )
    .join("\n");
}

function extractTailText(result?: Message): string {
  if (!result?.toolOutput) return "";
  return result.toolOutput.length > EDIT_TAIL_MAX_LEN ? result.toolOutput.slice(0, EDIT_TAIL_MAX_LEN) + "…" : result.toolOutput;
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
