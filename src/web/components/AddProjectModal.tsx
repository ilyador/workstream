import { useState, useEffect, useRef } from 'react';
import s from './AddProjectModal.module.css';

interface Props {
  onClose: () => void;
  onCreate: (name: string, localPath: string) => Promise<void>;
}

export function AddProjectModal({ onClose, onCreate }: Props) {
  const [name, setName] = useState('');
  const [localPath, setLocalPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const overlayRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !localPath.trim()) return;
    setError('');
    setLoading(true);
    try {
      await onCreate(name.trim(), localPath.trim());
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create project');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={s.overlay} ref={overlayRef} onClick={handleOverlayClick}>
      <div className={s.modal}>
        <h2 className={s.title}>New Project</h2>
        <p className={s.subtitle}>Add another project to CodeSync.</p>
        {error && <div className={s.error}>{error}</div>}
        <form className={s.form} onSubmit={handleSubmit}>
          <label className={s.fieldLabel}>Project name</label>
          <input
            ref={nameRef}
            className={s.input}
            type="text"
            placeholder="e.g., HOABot"
            value={name}
            onChange={e => setName(e.target.value)}
            required
          />
          <label className={s.fieldLabel}>Local folder path</label>
          <input
            className={s.input}
            type="text"
            placeholder="e.g., ~/Dev/hoabot or /home/user/projects/hoabot"
            value={localPath}
            onChange={e => setLocalPath(e.target.value)}
            required
          />
          <p className={s.hint}>The absolute path to your project's root folder on this machine.</p>
          <div className={s.actions}>
            <button className="btn btnSecondary" type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btnPrimary" type="submit" disabled={loading || !name.trim() || !localPath.trim()}>
              {loading ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
