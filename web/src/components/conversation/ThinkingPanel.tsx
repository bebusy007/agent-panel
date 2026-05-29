import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ThinkingPanelProps {
  thinkingText: string;
  thinkingStartMs: number;
  thinkingEndMs: number;
}

export function ThinkingPanel({
  thinkingText,
  thinkingStartMs,
  thinkingEndMs,
}: ThinkingPanelProps) {
  const [open, setOpen] = useState(true);
  const [elapsed, setElapsed] = useState('0.0s');
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!thinkingStartMs || thinkingEndMs) {
      if (thinkingEndMs && thinkingStartMs) {
        setElapsed(`${((thinkingEndMs - thinkingStartMs) / 1000).toFixed(1)}s`);
      }
      return;
    }

    const tick = () => {
      setElapsed(`${((Date.now() - thinkingStartMs) / 1000).toFixed(1)}s`);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [thinkingStartMs, thinkingEndMs]);

  if (!thinkingText) return null;

  return (
    <div className="mb-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-muted-foreground mb-1"
      >
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        Thinking
        {thinkingStartMs > 0 && (
          <span className="tabular-nums text-muted-foreground ml-1">
            ({thinkingEndMs === 0 ? `${elapsed} · ongoing` : elapsed})
          </span>
        )}
      </button>
      {open && (
        <div className="text-[12px] font-mono text-muted-foreground whitespace-pre-wrap bg-background rounded p-2 border border-border max-h-60 overflow-y-auto">
          {thinkingText}
        </div>
      )}
    </div>
  );
}
