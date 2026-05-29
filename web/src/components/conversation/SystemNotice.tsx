import { cn } from '@/lib/utils';
import type { AdaptedTimelineEntry } from '@/lib/conversation/history-adapter';

interface SystemNoticeProps {
  entry: AdaptedTimelineEntry;
}

const subtypeStyles: Record<string, string> = {
  turn_duration: 'text-[11px] text-muted-foreground text-center',
  away_summary: 'text-[11px] text-muted-foreground italic',
  permission_mode: 'text-[11px] text-muted-foreground',
  date_change: 'text-[11px] text-muted-foreground text-center font-medium',
};

function subtypeLabel(subtype: string): string {
  switch (subtype) {
    case 'turn_duration':
      return 'Turn duration';
    case 'away_summary':
      return 'Compaction summary';
    case 'permission_mode':
      return 'Permission mode changed';
    case 'date_change':
      return 'Date changed';
    default:
      return subtype;
  }
}

export function SystemNotice({ entry }: SystemNoticeProps) {
  const text = entry.text ?? '';
  const variantStyle = subtypeStyles[entry.kind] ?? subtypeStyles.default ?? '';

  if (!text && !entry.role) {
    return <div className={cn('py-1', variantStyle)}>{subtypeLabel(entry.role ?? 'system')}</div>;
  }

  return <div className={cn('py-1.5 px-2 my-1', variantStyle)}>{text && <span>{text}</span>}</div>;
}
