import { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { highlightDom } from '@/lib/highlight';

interface Props {
  text: string;
  highlight?: string;
}

export function MarkdownWithHighlight({ text, highlight }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !highlight?.trim()) return;
    const result = highlightDom(containerRef.current, highlight);
    return result.cleanup;
  }, [highlight, text]);

  return (
    <div className="md-body" ref={containerRef}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
