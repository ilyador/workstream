import type React from 'react';
import s from './NewProject.module.css';

interface NewProjectNameStepProps {
  name: string;
  localPath: string;
  loading: boolean;
  error: string;
  storageSummary: string;
  onBack: () => void;
  onNameChange: (value: string) => void;
  onLocalPathChange: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
}

export function NewProjectNameStep({
  name,
  localPath,
  loading,
  error,
  storageSummary,
  onBack,
  onNameChange,
  onLocalPathChange,
  onSubmit,
}: NewProjectNameStepProps) {
  return (
    <div className={s.container}>
      <button className={`btn btnGhost ${s.backWrap}`} onClick={onBack} type="button">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back
      </button>
      <h1 className={s.title}>Set up your project</h1>
      <p className={s.subtitle}>
        A project maps to a codebase on your machine.
        {storageSummary}
      </p>
      {error && <div className={s.error}>{error}</div>}
      <form className={s.form} onSubmit={onSubmit}>
        <label className={s.fieldLabel}>Project name</label>
        <input
          className={s.input}
          type="text"
          placeholder="e.g., HOABot"
          value={name}
          onChange={event => onNameChange(event.target.value)}
          required
          autoFocus
        />
        <label className={s.fieldLabel}>Local folder path</label>
        <input
          className={s.input}
          type="text"
          placeholder="e.g., ~/Dev/hoabot or /home/user/projects/hoabot"
          value={localPath}
          onChange={event => onLocalPathChange(event.target.value)}
          required
        />
        <p className={s.pathHint}>The absolute path to your project's root folder on this machine.</p>
        <button className={`btn btnPrimary ${s.submitWrap}`} type="submit" disabled={loading || !name.trim() || !localPath.trim()}>
          {loading ? 'Creating...' : 'Create Project'}
        </button>
      </form>
    </div>
  );
}
