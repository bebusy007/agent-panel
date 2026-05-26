import { Check, Circle, CircleDot } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Message } from '@/lib/api';

interface TodoItem {
  content?: string;
  status?: string;
  activeForm?: string;
  priority?: string;
}

export function TodoWriteCard({ tool }: { tool: Message; result?: Message }) {
  const input = (tool.toolInput as Record<string, unknown> | undefined) ?? {};
  // Both `todos` and `newTodos` show up in the wild — try both.
  const list = (
    Array.isArray(input.todos) ? input.todos : Array.isArray(input.newTodos) ? input.newTodos : []
  ) as TodoItem[];

  if (list.length === 0) {
    return <p className="px-3 pb-3 text-[11px] italic text-muted-foreground">无 todo 项</p>;
  }

  return (
    <ul className="space-y-1 px-3 pb-3">
      {list.map((t, i) => {
        const status = t.status ?? 'pending';
        const isDone = status === 'completed';
        const isInProg = status === 'in_progress';
        const Icon = isDone ? Check : isInProg ? CircleDot : Circle;
        const text = isInProg ? (t.activeForm ?? t.content ?? '') : (t.content ?? '');
        return (
          <li
            key={i}
            className={cn(
              'flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-xs',
              isDone
                ? 'border-emerald-500/20 bg-emerald-500/5 text-muted-foreground line-through'
                : isInProg
                  ? 'border-blue-500/30 bg-blue-500/5 text-fg'
                  : 'border-border bg-background/30 text-muted-foreground',
            )}
          >
            <Icon
              className={cn(
                'mt-0.5 size-3.5 shrink-0',
                isDone && 'text-emerald-400',
                isInProg && 'text-blue-400 animate-pulse',
                !isDone && !isInProg && 'text-muted-foreground',
              )}
            />
            <span className="flex-1">
              {text || <span className="italic text-muted-foreground">(空)</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
