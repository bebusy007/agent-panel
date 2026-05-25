const STORAGE_KEY = 'agent-panel:typography';

export interface TypoLevel {
  key: string;
  label: string;
  hint: string;
  cssVar: string;
  defaultPx: number;
  min: number;
  max: number;
}

export const TYPO_LEVELS: TypoLevel[] = [
  {
    key: 'h1',
    label: 'H1 页面标题',
    hint: '概览、用量、会话…',
    cssVar: '--text-h1',
    defaultPx: 24,
    min: 18,
    max: 32,
  },
  {
    key: 'h2',
    label: 'H2 卡片标题',
    hint: 'Section / 对话框',
    cssVar: '--text-h2',
    defaultPx: 16,
    min: 13,
    max: 22,
  },
  {
    key: 'body',
    label: 'Body 正文',
    hint: '描述、列表项',
    cssVar: '--text-body',
    defaultPx: 14,
    min: 12,
    max: 18,
  },
  {
    key: 'caption',
    label: 'Caption 辅助',
    hint: '时间戳、badge',
    cssVar: '--text-caption',
    defaultPx: 12,
    min: 10,
    max: 16,
  },
  {
    key: 'label',
    label: 'Label 标签',
    hint: 'UPPERCASE 小标题',
    cssVar: '--text-label',
    defaultPx: 11,
    min: 9,
    max: 14,
  },
  {
    key: 'sub',
    label: 'Sub 极辅助',
    hint: '表头、微标注',
    cssVar: '--text-sub',
    defaultPx: 10,
    min: 8,
    max: 13,
  },
];

export function getDefaults(): Record<string, number> {
  const map: Record<string, number> = {};
  for (const l of TYPO_LEVELS) map[l.key] = l.defaultPx;
  return map;
}

export function loadTypography(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, number>;
      const defaults = getDefaults();
      for (const l of TYPO_LEVELS) {
        if (typeof parsed[l.key] !== 'number') parsed[l.key] = defaults[l.key];
      }
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return getDefaults();
}

export function saveTypography(values: Record<string, number>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
}

export function applyTypography(values?: Record<string, number>): void {
  const v = values ?? loadTypography();
  const root = document.documentElement;
  for (const l of TYPO_LEVELS) {
    root.style.setProperty(l.cssVar, `${v[l.key]}px`);
  }
}
