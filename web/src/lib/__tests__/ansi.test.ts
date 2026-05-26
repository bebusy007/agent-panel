import { ansiToHtml, hasAnsiCodes, stripAnsi } from '../ansi';

describe('ansiToHtml', () => {
  it('returns empty for empty input', () => {
    expect(ansiToHtml('')).toBe('');
  });

  it('returns plain text unchanged', () => {
    expect(ansiToHtml('hello world')).toBe('hello world');
  });

  it('converts ANSI color codes to HTML spans', () => {
    const input = '\x1b[31mred text\x1b[0m';
    const result = ansiToHtml(input);
    expect(result).toContain('red text');
    expect(result).toContain('<span');
  });

  it('escapes HTML entities', () => {
    const input = "<script>alert('xss')</script>";
    const result = ansiToHtml(input);
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
  });
});

describe('hasAnsiCodes', () => {
  it('returns false for plain text', () => {
    expect(hasAnsiCodes('no codes here')).toBe(false);
  });

  it('returns true for text with ANSI codes', () => {
    expect(hasAnsiCodes('\x1b[32mgreen\x1b[0m')).toBe(true);
  });

  it('detects various ANSI sequences', () => {
    expect(hasAnsiCodes('\x1b[1mbold\x1b[0m')).toBe(true);
    expect(hasAnsiCodes('\x1b[4munderline\x1b[0m')).toBe(true);
  });
});

describe('stripAnsi', () => {
  it('returns plain text unchanged', () => {
    expect(stripAnsi('hello')).toBe('hello');
  });

  it('strips color codes', () => {
    expect(stripAnsi('\x1b[31mred\x1b[0m')).toBe('red');
  });

  it('strips multiple codes', () => {
    expect(stripAnsi('\x1b[1m\x1b[32mbold green\x1b[0m')).toBe('bold green');
  });

  it('handles question-mark sequences', () => {
    expect(stripAnsi('\x1b[?25l')).toBe('');
  });
});
