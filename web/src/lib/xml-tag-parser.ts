import { xmlTagRegistry } from "./xml-tag-registry";

export interface XmlSection {
  tag: string;
  content: string;
}

export interface ParsedXmlBlock {
  attrs: Record<string, string>;
  sections: XmlSection[];
}

export interface ParsedXmlTag {
  tagName: string;
  attrs: Record<string, string>;
  sections: XmlSection[];
  blocks: ParsedXmlBlock[];
  raw: string;
}

const TAG_RE = /<([\w-]+)>([\s\S]*?)<\/\1>/g;
const ATTR_RE = /([\w-]+)="([^"]*)"/g;

export function detectXmlTag(text: string): string | null {
  if (!text || text[0] !== "<") return null;
  const m = text.match(/^<([\w-]+)[\s>]/);
  if (!m) return null;
  const tag = m[1];
  return xmlTagRegistry[tag] ? tag : null;
}

function parseAttrs(openTag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  let m: RegExpExecArray | null;
  const re = new RegExp(ATTR_RE.source, "g");
  while ((m = re.exec(openTag)) !== null) {
    attrs[m[1]] = m[2];
  }
  return attrs;
}

export function parseXmlTag(text: string): ParsedXmlTag | null {
  const tagName = detectXmlTag(text);
  if (!tagName) return null;

  const blocks = parseAllBlocks(text, tagName);
  if (blocks.length === 0) return null;

  return {
    tagName,
    attrs: blocks[0].attrs,
    sections: blocks[0].sections,
    blocks,
    raw: text,
  };
}

function parseSingleBlock(inner: string): XmlSection[] {
  const sections: XmlSection[] = [];
  let lastEnd = 0;
  const re = new RegExp(TAG_RE.source, "g");
  let match: RegExpExecArray | null;

  while ((match = re.exec(inner)) !== null) {
    if (match.index > lastEnd) {
      const gap = inner.slice(lastEnd, match.index).trim();
      if (gap) sections.push({ tag: "__text__", content: gap });
    }
    sections.push({ tag: match[1], content: match[2].trim() });
    lastEnd = match.index + match[0].length;
  }

  if (lastEnd < inner.length) {
    const tail = inner.slice(lastEnd).trim();
    if (tail) sections.push({ tag: "__text__", content: tail });
  }

  if (sections.length === 0 && inner.trim()) {
    sections.push({ tag: "__text__", content: inner.trim() });
  }

  return sections;
}

function parseAllBlocks(text: string, tagName: string): ParsedXmlBlock[] {
  const blockRe = new RegExp(
    `<${tagName}([^>]*)>([\\s\\S]*?)<\\/${tagName}>`,
    "g",
  );
  const blocks: ParsedXmlBlock[] = [];
  let match: RegExpExecArray | null;

  while ((match = blockRe.exec(text)) !== null) {
    blocks.push({
      attrs: parseAttrs(match[1]),
      sections: parseSingleBlock(match[2].trim()),
    });
  }

  return blocks;
}
