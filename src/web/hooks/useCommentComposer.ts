import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import type { MentionMember } from '../components/task-card-types';

interface UseCommentComposerArgs {
  mentionMembers: MentionMember[];
  addComment: (body: string) => Promise<unknown>;
}

export function useCommentComposer({ mentionMembers, addComment }: UseCommentComposerArgs) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIdx, setMentionIdx] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const mentionMatches = mentionQuery !== null
    ? mentionMembers.filter(member => member.name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 5)
    : [];

  const resetInputHeight = () => {
    if (inputRef.current) inputRef.current.style.height = 'auto';
  };

  const adjustHeight = () => {
    const element = inputRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  };

  useEffect(() => {
    adjustHeight();
  }, [text]);

  const handleSend = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await addComment(body);
      setText('');
      setMentionQuery(null);
      resetInputHeight();
    } finally {
      setSending(false);
    }
  };

  const insertMention = (name: string) => {
    const input = inputRef.current;
    if (!input) return;
    const cursor = input.selectionStart || 0;
    const before = text.slice(0, cursor);
    const atIdx = before.lastIndexOf('@');
    if (atIdx < 0) return;
    const after = text.slice(cursor);
    setText(before.slice(0, atIdx) + `@${name} ` + after);
    setMentionQuery(null);
    setTimeout(() => {
      const newPos = atIdx + name.length + 2;
      input.focus();
      input.setSelectionRange(newPos, newPos);
    }, 0);
  };

  const handleChange = (value: string) => {
    setText(value);
    const cursor = inputRef.current?.selectionStart || value.length;
    const before = value.slice(0, cursor);
    const atMatch = before.match(/@(\w*)$/);
    if (atMatch) {
      setMentionQuery(atMatch[1]);
      setMentionIdx(0);
      return;
    }
    setMentionQuery(null);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (mentionMatches.length > 0 && mentionQuery !== null) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setMentionIdx(index => Math.min(index + 1, mentionMatches.length - 1));
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setMentionIdx(index => Math.max(index - 1, 0));
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        insertMention(mentionMatches[mentionIdx].name);
        return;
      }
      if (event.key === 'Escape') {
        setMentionQuery(null);
        return;
      }
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  return {
    text,
    sending,
    inputRef,
    mentionMatches,
    mentionIdx,
    handleSend,
    insertMention,
    handleChange,
    handleKeyDown,
  };
}
