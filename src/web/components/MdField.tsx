import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import s from './MdField.module.css';

interface Props {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: number;
  /** Render a custom textarea instead of the default one. Called with (stopEditing) callback. */
  renderTextarea?: (stopEditing: () => void) => ReactNode;
}

export function MdField({ value, onChange, placeholder, className, minHeight, renderTextarea }: Props) {
  const [editing, setEditing] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = useCallback((el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, []);

  useEffect(() => {
    if (editing && taRef.current) {
      taRef.current.focus();
      autoResize(taRef.current);
    }
  }, [editing, autoResize]);

  if (editing) {
    if (renderTextarea) return <>{renderTextarea(() => setEditing(false))}</>;
    return (
      <textarea
        ref={taRef}
        className={`${s.textarea} ${className || ''}`}
        style={minHeight ? { minHeight } : undefined}
        value={value}
        onChange={e => {
          onChange(e.target.value);
          autoResize(e.target);
        }}
        onBlur={() => setEditing(false)}
        placeholder={placeholder}
      />
    );
  }

  if (!value) {
    return (
      <div
        className={`${s.previewEmpty} ${className || ''}`}
        style={minHeight ? { minHeight } : undefined}
        tabIndex={0}
        onClick={() => setEditing(true)}
        onFocus={() => setEditing(true)}
      >
        {placeholder || 'Click to edit...'}
      </div>
    );
  }

  return (
    <div
      className={`${s.preview} ${className || ''}`}
      style={minHeight ? { minHeight } : undefined}
      tabIndex={0}
      onClick={() => setEditing(true)}
      onFocus={() => setEditing(true)}
    >
      <Markdown remarkPlugins={[remarkGfm]}>{value}</Markdown>
    </div>
  );
}
