import { useState } from 'react';
import { checkHealth } from '../lib/api';
import type { SupabaseConfig } from '../lib/api';
import s from './NewProject.module.css';

interface Props {
  onCreate: (name: string, supabaseConfig: SupabaseConfig, localPath: string) => Promise<void>;
}

type SetupMode = 'local' | 'cloud' | 'custom' | null;
type HealthStatus = 'idle' | 'checking' | 'ok' | 'error';

export function NewProject({ onCreate }: Props) {
  const [step, setStep] = useState<'setup' | 'name'>('setup');
  const [mode, setMode] = useState<SetupMode>(null);
  const [name, setName] = useState('');
  const [localPath, setLocalPath] = useState('');
  const [loading, setLoading] = useState(false);

  // Local mode state
  const [healthStatus, setHealthStatus] = useState<HealthStatus>('idle');

  // Cloud mode state
  const [cloudUrl, setCloudUrl] = useState('');
  const [cloudKey, setCloudKey] = useState('');

  // Custom mode state
  const [customUrl, setCustomUrl] = useState('');
  const [customKey, setCustomKey] = useState('');

  async function handleCheckConnection() {
    setHealthStatus('checking');
    try {
      const result = await checkHealth();
      setHealthStatus(result.ok ? 'ok' : 'error');
    } catch {
      setHealthStatus('error');
    }
  }

  function handleContinue() {
    if (mode === 'cloud' && (!cloudUrl.trim() || !cloudKey.trim())) return;
    if (mode === 'custom' && (!customUrl.trim() || !customKey.trim())) return;
    setStep('name');
  }

  function canContinue(): boolean {
    if (!mode) return false;
    if (mode === 'cloud') return cloudUrl.trim() !== '' && cloudKey.trim() !== '';
    if (mode === 'custom') return customUrl.trim() !== '' && customKey.trim() !== '';
    return true;
  }

  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !mode || !localPath.trim()) return;
    setError('');
    setLoading(true);
    try {
      const config: SupabaseConfig = {
        mode,
        ...(mode === 'cloud' ? { url: cloudUrl.trim(), serviceRoleKey: cloudKey.trim() } : {}),
        ...(mode === 'custom' ? { url: customUrl.trim(), serviceRoleKey: customKey.trim() } : {}),
        ...(mode === 'local' ? { url: 'http://127.0.0.1:54321' } : {}),
      };
      await onCreate(name.trim(), config, localPath.trim());
    } catch (err: any) {
      setError(err.message || 'Failed to create project');
    } finally {
      setLoading(false);
    }
  }

  if (step === 'setup') {
    return (
      <div className={s.container}>
        <h1 className={s.title}>How do you want to store data?</h1>
        <p className={s.subtitle}>WorkStream uses Supabase for storage. Choose a setup.</p>

        <div className={s.cards}>
          <button
            className={`${s.card} ${mode === 'local' ? s.cardSelected : ''}`}
            onClick={() => setMode('local')}
            type="button"
          >
            <span className={s.cardIcon}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="2" y="4" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M6 10h8M6 13h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </span>
            <span className={s.cardTitle}>Local (Docker)</span>
            <span className={s.cardDesc}>Run Supabase on your machine. Good for development.</span>
          </button>

          <button
            className={`${s.card} ${mode === 'cloud' ? s.cardSelected : ''}`}
            onClick={() => setMode('cloud')}
            type="button"
          >
            <span className={s.cardIcon}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M5.5 14.5A3.5 3.5 0 015 7.536 5 5 0 0114.63 6.5 4 4 0 0115 14.5H5.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>
            </span>
            <span className={s.cardTitle}>Supabase Cloud</span>
            <span className={s.cardDesc}>Connect to a hosted Supabase project. Good for teams.</span>
          </button>

          <button
            className={`${s.card} ${mode === 'custom' ? s.cardSelected : ''}`}
            onClick={() => setMode('custom')}
            type="button"
          >
            <span className={s.cardIcon}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 2v4M10 14v4M2 10h4M14 10h4M4.93 4.93l2.83 2.83M12.24 12.24l2.83 2.83M15.07 4.93l-2.83 2.83M7.76 12.24l-2.83 2.83" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </span>
            <span className={s.cardTitle}>Custom Connection</span>
            <span className={s.cardDesc}>Connect to a self-hosted Supabase on another machine or custom URL.</span>
          </button>
        </div>

        {mode === 'local' && (
          <div className={s.detail}>
            <p className={s.detailLabel}>Make sure Docker is running, then run:</p>
            <pre className={s.codeBlock}>npx supabase start && npx supabase db reset</pre>
            <button
              className={`btn btnSecondary ${healthStatus === 'ok' ? s.checkBtnOk : ''} ${healthStatus === 'error' ? s.checkBtnError : ''}`}
              onClick={handleCheckConnection}
              disabled={healthStatus === 'checking'}
              type="button"
              style={{ alignSelf: 'flex-start' }}
            >
              {healthStatus === 'idle' && 'Check Connection'}
              {healthStatus === 'checking' && 'Checking...'}
              {healthStatus === 'ok' && 'Connected'}
              {healthStatus === 'error' && 'Connection Failed -- Retry'}
            </button>
          </div>
        )}

        {mode === 'cloud' && (
          <div className={s.detail}>
            <label className={s.fieldLabel}>Supabase Project URL</label>
            <input
              className={s.input}
              type="url"
              placeholder="https://xxxx.supabase.co"
              value={cloudUrl}
              onChange={e => setCloudUrl(e.target.value)}
              autoFocus
            />
            <label className={s.fieldLabel}>Service Role Key</label>
            <input
              className={s.input}
              type="password"
              placeholder="eyJhbGciOiJIUzI1NiIs..."
              value={cloudKey}
              onChange={e => setCloudKey(e.target.value)}
            />
          </div>
        )}

        {mode === 'custom' && (
          <div className={s.detail}>
            <p className={s.detailLabel}>Connect to a Supabase instance running on a specific machine or network.</p>
            <label className={s.fieldLabel}>Supabase URL</label>
            <input
              className={s.input}
              type="url"
              placeholder="http://192.168.1.100:54321"
              value={customUrl}
              onChange={e => setCustomUrl(e.target.value)}
              autoFocus
            />
            <label className={s.fieldLabel}>Service Role Key</label>
            <input
              className={s.input}
              type="password"
              placeholder="eyJhbGciOiJIUzI1NiIs..."
              value={customKey}
              onChange={e => setCustomKey(e.target.value)}
            />
          </div>
        )}

        {mode && (
          <button
            className={`btn btnPrimary ${s.submitWrap}`}
            onClick={handleContinue}
            disabled={!canContinue()}
            type="button"
          >
            Continue
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={s.container}>
      <button className={`btn btnGhost ${s.backWrap}`} onClick={() => setStep('setup')} type="button">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        Back
      </button>
      <h1 className={s.title}>Set up your project</h1>
      <p className={s.subtitle}>
        A project maps to a codebase on your machine.
        {mode === 'local' ? ' Using local Supabase.' : mode === 'custom' ? ` Using ${customUrl}.` : ` Using ${cloudUrl}.`}
      </p>
      {error && <div style={{ color: 'var(--red)', background: 'var(--red-bg)', padding: '12px 16px', borderRadius: 8, fontSize: 14, marginBottom: 16, maxWidth: 360, width: '100%' }}>{error}</div>}
      <form className={s.form} onSubmit={handleSubmit}>
        <label className={s.fieldLabel}>Project name</label>
        <input
          className={s.input}
          type="text"
          placeholder="e.g., HOABot"
          value={name}
          onChange={e => setName(e.target.value)}
          required
          autoFocus
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
        <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: -8 }}>
          The absolute path to your project's root folder on this machine.
        </p>
        <button className={`btn btnPrimary ${s.submitWrap}`} type="submit" disabled={loading || !name.trim() || !localPath.trim()}>
          {loading ? 'Creating...' : 'Create Project'}
        </button>
      </form>
    </div>
  );
}
