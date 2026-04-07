import { useEffect, useEffectEvent, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { PreviewFile } from './filePreviewContext';
import { isMdFile } from './file-preview-utils';
import s from './FilePreview.module.css';

interface FilePreviewContentProps {
  file: PreviewFile;
  editing: boolean;
  onTextChange?: (text: string) => void;
}

export function FilePreviewContent({ file, editing, onTextChange }: FilePreviewContentProps) {
  const { mime_type: mime, url, filename } = file;
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const notifyTextChange = useEffectEvent((value: string) => {
    onTextChange?.(value);
  });

  useEffect(() => {
    let active = true;
    const isText = mime.startsWith('text/') || mime === 'application/json' || isMdFile(mime, filename);
    if (!isText) {
      queueMicrotask(() => {
        if (!active) return;
        setText(null);
        setLoading(false);
      });
      return () => {
        active = false;
      };
    }

    const controller = new AbortController();
    queueMicrotask(() => {
      if (!active || controller.signal.aborted) return;
      setText(null);
      setLoading(true);
    });
    fetch(url, { signal: controller.signal })
      .then(response => response.text())
      .then(value => {
        if (!active) return;
        setText(value);
        notifyTextChange(value);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!active || (err instanceof DOMException && err.name === 'AbortError')) return;
        setText('Failed to load file');
        setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [filename, url, mime]);

  if (mime.startsWith('image/')) {
    return <img src={url} alt={filename} className={s.previewImage} />;
  }

  if (mime.startsWith('video/')) {
    return <video src={url} controls className={s.previewVideo} />;
  }

  if (mime.startsWith('audio/')) {
    return (
      <div className={s.audioWrap}>
        <div className={s.audioIcon}>&#9835;</div>
        <div className={s.audioName}>{filename}</div>
        <audio src={url} controls className={s.previewAudio} />
      </div>
    );
  }

  if (mime === 'application/pdf') {
    return <iframe src={url} className={s.previewPdf} title={filename} />;
  }

  if (isMdFile(mime, filename)) {
    if (loading) return <div className={s.loading}>Loading...</div>;
    if (editing) {
      return (
        <textarea
          className={s.mdEditor}
          value={text || ''}
          onChange={event => {
            setText(event.target.value);
            onTextChange?.(event.target.value);
          }}
          spellCheck={false}
        />
      );
    }
    return (
      <div className={s.previewMarkdown}>
        <Markdown remarkPlugins={[remarkGfm]}>{text || ''}</Markdown>
      </div>
    );
  }

  if (mime === 'application/json') {
    if (loading) return <div className={s.loading}>Loading...</div>;
    let formatted = text || '';
    try {
      formatted = JSON.stringify(JSON.parse(formatted), null, 2);
    } catch {
      // Leave invalid JSON as-is for inspection.
    }
    return <pre className={s.previewCode}>{formatted}</pre>;
  }

  if (mime.startsWith('text/')) {
    if (loading) return <div className={s.loading}>Loading...</div>;
    return <pre className={s.previewCode}>{text || ''}</pre>;
  }

  return null;
}
