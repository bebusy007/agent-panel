import AnsiToHtml from 'ansi-to-html';

const converter = new AnsiToHtml({
  fg: 'inherit',
  bg: 'transparent',
  newline: false,
  escapeXML: true,
});

export function ansiToHtml(s: string): string {
  if (!s) return '';
  return converter.toHtml(s);
}

export function hasAnsiCodes(s: string): boolean {
  return /\x1b\[[0-9;]*[a-zA-Z]/.test(s);
}

const STRIP_RE = /\x1b\[[0-9;?]*[a-zA-Z]/g;

export function stripAnsi(s: string): string {
  return s.replace(STRIP_RE, '');
}
