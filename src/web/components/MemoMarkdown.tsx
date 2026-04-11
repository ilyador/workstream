import { memo } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Memoized GFM-enabled markdown renderer. react-markdown re-parses on every
// render unless wrapped, and task-card descriptions re-render frequently
// (comment counts, job status, board drag updates).
export const MemoMarkdown = memo(function MemoMarkdown({ text }: { text: string }) {
  return <Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown>;
});
