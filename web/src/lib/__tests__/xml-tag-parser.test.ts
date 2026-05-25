import { detectXmlTag, parseXmlTag } from '../xml-tag-parser';

describe('detectXmlTag', () => {
  it('returns null for empty/undefined', () => {
    expect(detectXmlTag('')).toBe(null);
  });

  it('returns null for non-xml text', () => {
    expect(detectXmlTag('hello world')).toBe(null);
  });

  it('returns null for unregistered tag', () => {
    expect(detectXmlTag('<unknown-tag>content</unknown-tag>')).toBe(null);
  });

  it('detects registered tags', () => {
    expect(detectXmlTag('<task-notification>x</task-notification>')).toBe('task-notification');
    expect(detectXmlTag('<system-reminder>x</system-reminder>')).toBe('system-reminder');
    expect(detectXmlTag('<teammate-message teammate_id="a">x</teammate-message>')).toBe(
      'teammate-message',
    );
  });

  it('requires text to start with <', () => {
    expect(detectXmlTag(' <task-notification>x</task-notification>')).toBe(null);
  });
});

describe('parseXmlTag', () => {
  it('returns null for non-xml text', () => {
    expect(parseXmlTag('plain text')).toBe(null);
  });

  it('returns null for unregistered tags', () => {
    expect(parseXmlTag('<fake-tag>content</fake-tag>')).toBe(null);
  });

  it('parses task-notification with nested sections', () => {
    const xml = `<task-notification><task-id>42</task-id><status>done</status><summary>Built it</summary></task-notification>`;
    const result = parseXmlTag(xml);
    expect(result).not.toBe(null);
    expect(result!.tagName).toBe('task-notification');
    expect(result!.sections.length).toBeGreaterThan(0);
    expect(result!.sections.find((s) => s.tag === 'task-id')?.content).toBe('42');
  });

  it('parses attributes', () => {
    const xml = `<teammate-message teammate_id="bob" summary="hi">content here</teammate-message>`;
    const result = parseXmlTag(xml);
    expect(result).not.toBe(null);
    expect(result!.attrs.teammate_id).toBe('bob');
    expect(result!.attrs.summary).toBe('hi');
  });

  it('handles multiple blocks of same tag', () => {
    const xml = `<system-reminder>first</system-reminder>\n<system-reminder>second</system-reminder>`;
    const result = parseXmlTag(xml);
    expect(result).not.toBe(null);
    expect(result!.blocks.length).toBe(2);
    expect(result!.blocks[0].sections[0].content).toBe('first');
    expect(result!.blocks[1].sections[0].content).toBe('second');
  });

  it('extracts text content as __text__ section', () => {
    const xml = `<system-reminder>some plain text</system-reminder>`;
    const result = parseXmlTag(xml);
    expect(result!.sections[0].tag).toBe('__text__');
    expect(result!.sections[0].content).toBe('some plain text');
  });
});
