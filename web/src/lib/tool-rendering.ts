/**
 * Render-time helpers for tool cards. Mirrors OpenCovibe's
 * tool-rendering.ts but trimmed to what we actually need on the
 * read-only React side.
 */

const LANG_BY_EXT: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  jsonc: 'json',
  md: 'markdown',
  markdown: 'markdown',
  py: 'python',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  m: 'objectivec',
  mm: 'objectivec',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  hpp: 'cpp',
  cc: 'cpp',
  cs: 'csharp',
  rb: 'ruby',
  php: 'php',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  fish: 'bash',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'toml',
  xml: 'xml',
  html: 'xml',
  htm: 'xml',
  css: 'css',
  scss: 'scss',
  sass: 'scss',
  less: 'less',
  sql: 'sql',
  svelte: 'xml',
  vue: 'xml',
  proto: 'protobuf',
};

export function getLanguageFromPath(path?: string): string {
  if (!path) return '';
  const m = path.match(/\.([a-zA-Z0-9]+)$/);
  if (!m) return '';
  return LANG_BY_EXT[m[1].toLowerCase()] ?? '';
}

const IMAGE_EXTS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'svg',
  'bmp',
  'ico',
  'avif',
  'tiff',
  'tif',
]);

export function isImagePath(path?: string): boolean {
  if (!path) return false;
  const m = path.match(/\.([a-zA-Z0-9]+)$/);
  if (!m) return false;
  return IMAGE_EXTS.has(m[1].toLowerCase());
}

/** Best-effort: render any tool output into a single string. */
export function extractOutputText(output: unknown): string {
  if (!output) return '';
  if (typeof output === 'string') return output;
  if (Array.isArray(output)) {
    return output
      .map((x) =>
        x && typeof x === 'object' && typeof (x as Record<string, unknown>).text === 'string'
          ? ((x as Record<string, unknown>).text as string)
          : typeof x === 'string'
            ? x
            : '',
      )
      .filter(Boolean)
      .join('\n');
  }
  if (typeof output === 'object') {
    const o = output as Record<string, unknown>;
    if (typeof o.text === 'string') return o.text;
    if (typeof o.content === 'string') return o.content;
    if (Array.isArray(o.content)) return extractOutputText(o.content);
    try {
      return JSON.stringify(o, null, 2);
    } catch {
      return String(o);
    }
  }
  return String(output);
}

/** Strip the trailing "/Users/foo/bar" prefix down to the last 2 segments
 *  for a more compact path label. */
export function shortenPath(p: string): string {
  if (!p) return '';
  const parts = p.split('/').filter(Boolean);
  if (parts.length <= 2) return p;
  return '…/' + parts.slice(-2).join('/');
}
