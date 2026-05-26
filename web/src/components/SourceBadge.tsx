import type { MCPSourceType, SkillSource } from '@/lib/api';
import { describeMcpSource, describeSkillSource, sourceColor, cn } from '@/lib/utils';

export function SkillSourceBadge({
  source,
  full = false,
}: {
  source: SkillSource;
  full?: boolean;
}) {
  const desc = describeSkillSource(source);
  return (
    <span
      title={desc.label}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ring-1 ring-inset font-medium',
        sourceColor(source),
      )}
    >
      {full ? desc.label : desc.short}
    </span>
  );
}

export function McpSourceBadge({ source }: { source: MCPSourceType }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ring-1 ring-inset font-medium',
        sourceColor(source),
      )}
    >
      {describeMcpSource(source)}
    </span>
  );
}
