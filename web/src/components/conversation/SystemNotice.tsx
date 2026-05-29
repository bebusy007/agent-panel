import { cn } from '@/lib/utils';
import type { AdaptedTimelineEntry } from '@/lib/conversation/history-adapter';

interface SystemNoticeProps {
  entry: AdaptedTimelineEntry;
}

const roleStyles: Record<string, string> = {
  system: 'text-[11px] text-muted-foreground',
  meta: 'text-[11px] text-muted-foreground text-center',
};

export function SystemNotice({ entry }: SystemNoticeProps) {
  const text = entry.text ?? '';
  const variant = roleStyles[entry.role ?? ''] ?? roleStyles.system;

  if (!text) {
    return (
      <div className={cn('py-1', variant)}>
        <span className="text-muted-foreground">{entry.role ?? 'system'}</span>
      </div>
    );
  }

  return (
    <div className={cn('py-1 px-2', variant)}>
      <span>{text}</span>
    </div>
  );
}
