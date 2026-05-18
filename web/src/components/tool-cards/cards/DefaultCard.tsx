import { extractOutputText } from "@/lib/tool-rendering";
import type { Message } from "@/lib/api";
import { CopyButton } from "../ToolCardHeader";
import { MarkdownWithHighlight } from "@/components/session/MarkdownWithHighlight";
import { SystemXmlBlock } from "@/components/session/SystemXmlBlock";
import { detectXmlTag } from "@/lib/xml-tag-parser";

export function DefaultCard({ tool, result }: { tool: Message; result?: Message }) {
  const inputStr = formatInput(tool.toolInput);
  const outputStr = extractOutputText(result?.toolOutput ?? tool.toolOutput);

  return (
    <div className="space-y-2 px-3 pb-3">
      {inputStr && <JsonBlock title="Input" body={inputStr} raw={formatInput(tool.toolInput)} />}
      {outputStr && <SmartOutputBlock body={outputStr} />}
      {!outputStr && !result && (
        <p className="text-[11px] italic text-muted-foreground">
          该来源未记录工具结果（cursor-agent 等）
        </p>
      )}
    </div>
  );
}

function JsonBlock({ title, body, raw }: { title: string; body: string; raw: string }) {
  return (
    <div className="rounded-md border border-border bg-background/40">
      <div className="flex items-center justify-between border-b border-border px-2.5 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>{title}</span>
        <CopyButton text={raw} />
      </div>
      <pre className="max-h-[400px] overflow-auto whitespace-pre-wrap break-words px-2.5 py-1.5 font-mono text-[11px] leading-relaxed text-muted-foreground">
        {body}
      </pre>
    </div>
  );
}

function SmartOutputBlock({ body }: { body: string }) {
  const trimmed = body.trim();

  const xmlTag = detectXmlTag(trimmed);
  if (xmlTag) {
    return (
      <div className="rounded-md border border-border bg-background/40">
        <div className="flex items-center justify-between border-b border-border px-2.5 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          <span>Output</span>
          <CopyButton text={body} />
        </div>
        <div className="max-h-[400px] overflow-auto px-2.5 py-1.5">
          <SystemXmlBlock text={trimmed} />
        </div>
      </div>
    );
  }

  if (looksLikeMarkdown(trimmed)) {
    return (
      <div className="rounded-md border border-border bg-background/40">
        <div className="flex items-center justify-between border-b border-border px-2.5 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          <span>Output</span>
          <CopyButton text={body} />
        </div>
        <div className="max-h-[400px] overflow-auto px-2.5 py-1.5 text-sm">
          <MarkdownWithHighlight text={trimmed} />
        </div>
      </div>
    );
  }

  // JSON or plain text — both render as formatted pre
  const display = isValidJson(trimmed) ? formatJson(JSON.parse(trimmed)) : body;
  return (
    <div className="rounded-md border border-border bg-background/40">
      <div className="flex items-center justify-between border-b border-border px-2.5 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>Output</span>
        <CopyButton text={body} />
      </div>
      <pre className="max-h-[400px] overflow-auto whitespace-pre-wrap break-words px-2.5 py-1.5 font-mono text-[11px] leading-relaxed text-muted-foreground">
        {display || <span className="italic text-muted-foreground">(empty)</span>}
      </pre>
    </div>
  );
}

function formatInput(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function formatJson(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function isValidJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

function looksLikeMarkdown(text: string): boolean {
  if (/^#{1,6}\s/m.test(text)) return true;
  if (/\*\*[^*]+\*\*/.test(text)) return true;
  if (/\|---/.test(text)) return true;
  if (/^- \[[ x]\]/m.test(text)) return true;
  if (/^```/m.test(text)) return true;
  return false;
}
