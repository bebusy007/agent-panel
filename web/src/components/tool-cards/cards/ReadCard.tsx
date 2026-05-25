import { useMemo } from 'react';
import hljs from 'highlight.js';
import {
  extractOutputText,
  getLanguageFromPath,
  isImagePath,
  shortenPath,
} from '@/lib/tool-rendering';
import type { Message } from '@/lib/api';
import { CopyButton } from '../ToolCardHeader';
import { HIGHLIGHT_SIZE_LIMIT, HIGHLIGHT_LINE_LIMIT } from '@/lib/constants';

interface Props {
  tool: Message;
  result?: Message;
}

export function ReadCard({ tool, result }: Props) {
  const input = (tool.toolInput as Record<string, unknown> | undefined) ?? {};
  const filePath =
    (input.file_path as string) || (input.path as string) || (input.filePath as string) || '';
  const lang = getLanguageFromPath(filePath);
  const output = result?.toolOutput ?? extractOutputText(tool.toolOutput);
  const startLine = numberFrom(input.offset) ?? numberFrom(input.start_line) ?? 1;

  // tool_use_result on Claude often has a structured `file` block with
  // clean content + numLines + startLine. Try that path first.
  const structured = useMemo(() => {
    const tur = (result?.raw as Record<string, unknown> | undefined)?.tool_use_result as
      | { file?: { content?: string; startLine?: number; numLines?: number; totalLines?: number } }
      | undefined;
    return tur?.file;
  }, [result]);

  const content = structured?.content ?? output ?? '';
  const realStartLine = structured?.startLine ?? startLine;
  const totalLines = structured?.totalLines;

  if (isImagePath(filePath)) {
    return (
      <div className="px-3 pb-3 text-[11px] text-muted-foreground">
        🖼 图片文件 — 内容由 agent 直接读取，未在此渲染
        <div className="mt-1 font-mono text-muted-foreground">{filePath}</div>
      </div>
    );
  }

  return (
    <div className="space-y-1 px-3 pb-3">
      <div className="flex items-center justify-between rounded-md border border-border bg-secondary/50 px-2.5 py-1 text-[11px]">
        <span className="font-mono text-muted-foreground" title={filePath}>
          {shortenPath(filePath)}
        </span>
        <div className="flex items-center gap-2 text-muted-foreground">
          {totalLines && <span className="tabular-nums">共 {totalLines} 行</span>}
          <CopyButton text={content} />
        </div>
      </div>
      <CodeWithLineNumbers code={content} lang={lang} startLine={realStartLine} />
    </div>
  );
}

function numberFrom(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function CodeWithLineNumbers({
  code,
  lang,
  startLine,
}: {
  code: string;
  lang: string;
  startLine: number;
}) {
  const html = useMemo(() => renderCode(code, lang), [code, lang]);
  const lineCount = code.split('\n').length;

  return (
    <div className="overflow-auto rounded-md border border-border bg-background/60 font-mono text-[11px] leading-snug">
      <table className="w-full border-collapse">
        <tbody>
          {Array.from({ length: lineCount }).map((_, i) => {
            const lineHtml = html[i] ?? '';
            return (
              <tr key={i}>
                <td className="select-none whitespace-nowrap border-r border-border/40 bg-background/40 px-2 py-px text-right text-muted-foreground tabular-nums">
                  {startLine + i}
                </td>
                <td
                  className="whitespace-pre-wrap break-all px-2 py-px text-muted-foreground"
                  dangerouslySetInnerHTML={{ __html: lineHtml || '&nbsp;' }}
                />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function renderCode(code: string, lang: string): string[] {
  const escaped = escape(code);
  if (!lang || !hljs.getLanguage(lang)) return escaped.split('\n');
  if (code.length > HIGHLIGHT_SIZE_LIMIT || code.split('\n').length > HIGHLIGHT_LINE_LIMIT) {
    // Skip highlighting for huge files — keep page snappy.
    return escaped.split('\n');
  }
  try {
    return hljs.highlight(code, { language: lang }).value.split('\n');
  } catch {
    return escaped.split('\n');
  }
}

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
