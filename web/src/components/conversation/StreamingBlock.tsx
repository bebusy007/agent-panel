import { useRef, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { cn, roleColor } from '@/lib/utils';
import { ThinkingPanel } from '@/components/conversation/ThinkingPanel';
import type { StreamingState } from '@/lib/conversation/types';

interface StreamingBlockProps {
  streaming: StreamingState;
}

/**
 * Renders the currently-streaming assistant response.
 *
 * Text rendering strategy (from design doc §0.4):
 * - Thinking: plain text with elapsed timer
 * - Text < 500 chars: plain text + blinking cursor (avoid markdown jitter)
 * - Text >= 500 chars: split on \n\n, render completed paragraphs as markdown,
 *   last paragraph as plain text + cursor
 * - TurnComplete: this component disappears, replaced by formal AssistantMessage entry
 */
export function StreamingBlock({ streaming }: StreamingBlockProps) {
  const text = streaming.streamingText;
  const cursorRef = useRef<HTMLSpanElement>(null);

  // Blinking cursor animation
  useEffect(() => {
    const el = cursorRef.current;
    if (!el) return;
    let visible = true;
    const id = setInterval(() => {
      visible = !visible;
      el.style.opacity = visible ? '1' : '0';
    }, 530);
    return () => clearInterval(id);
  }, []);

  const { completed, trailing } = useMemo(() => {
    if (text.length < 500) return { completed: '', trailing: text };
    const parts = text.split('\n\n');
    if (parts.length <= 1) return { completed: '', trailing: text };
    const last = parts.pop()!;
    const candidate = parts.join('\n\n') + '\n\n';
    // Don't split inside an unclosed code fence (```````)
    if ((candidate.match(/```/g) || []).length % 2 !== 0) return { completed: '', trailing: text };
    return { completed: candidate, trailing: last };
  }, [text]);

  if (!text && !streaming.thinkingText) return null;

  return (
    <div className={cn('group relative rounded-lg border px-3.5 py-2.5', roleColor('assistant'))}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
          Assistant
        </span>
        {streaming.model && (
          <span className="font-mono text-[11px] text-muted-foreground ml-1">
            {streaming.model.split('-').slice(-1)[0]}
          </span>
        )}
        <span className="text-[10px] text-muted-foreground ml-auto animate-pulse">
          streaming...
        </span>
      </div>

      {/* Thinking panel */}
      <ThinkingPanel
        thinkingText={streaming.thinkingText}
        thinkingStartMs={streaming.thinkingStartMs}
        thinkingEndMs={streaming.thinkingEndMs}
      />

      {/* Streaming text */}
      {text && (
        <div>
          {completed ? (
            <div className="md-body mb-1">
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                {completed}
              </ReactMarkdown>
            </div>
          ) : null}
          <div className="text-sm leading-relaxed">
            <span className="whitespace-pre-wrap">{trailing}</span>
            <span
              ref={cursorRef}
              className="inline-block w-[1ch] h-[1.2em] bg-muted-foreground align-text-bottom ml-0.5"
            />
          </div>
        </div>
      )}
    </div>
  );
}
