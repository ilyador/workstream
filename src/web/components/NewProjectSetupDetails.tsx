import type { HealthStatus, SetupMode } from './new-project-types';
import s from './NewProject.module.css';

interface NewProjectSetupDetailsProps {
  mode: SetupMode;
  healthStatus: HealthStatus;
  cloudUrl: string;
  cloudKey: string;
  customUrl: string;
  customKey: string;
  onCloudUrlChange: (value: string) => void;
  onCloudKeyChange: (value: string) => void;
  onCustomUrlChange: (value: string) => void;
  onCustomKeyChange: (value: string) => void;
  onCheckConnection: () => void;
}

export function NewProjectSetupDetails({
  mode,
  healthStatus,
  cloudUrl,
  cloudKey,
  customUrl,
  customKey,
  onCloudUrlChange,
  onCloudKeyChange,
  onCustomUrlChange,
  onCustomKeyChange,
  onCheckConnection,
}: NewProjectSetupDetailsProps) {
  if (mode === 'local') {
    return (
      <div className={s.detail}>
        <p className={s.detailLabel}>Make sure Docker is running, then run:</p>
        <pre className={s.codeBlock}>npx supabase start && npx supabase db reset</pre>
        <button
          className={`btn btnSecondary ${s.checkButton} ${healthStatus === 'ok' ? s.checkBtnOk : ''} ${healthStatus === 'error' ? s.checkBtnError : ''}`}
          onClick={onCheckConnection}
          disabled={healthStatus === 'checking'}
          type="button"
        >
          {healthStatus === 'idle' && 'Check Connection'}
          {healthStatus === 'checking' && 'Checking...'}
          {healthStatus === 'ok' && 'Connected'}
          {healthStatus === 'error' && 'Connection Failed -- Retry'}
        </button>
      </div>
    );
  }

  if (mode === 'cloud') {
    return (
      <div className={s.detail}>
        <label className={s.fieldLabel}>Supabase Project URL</label>
        <input
          className={s.input}
          type="url"
          placeholder="https://xxxx.supabase.co"
          value={cloudUrl}
          onChange={event => onCloudUrlChange(event.target.value)}
          autoFocus
        />
        <label className={s.fieldLabel}>Service Role Key</label>
        <input
          className={s.input}
          type="password"
          placeholder="eyJhbGciOiJIUzI1NiIs..."
          value={cloudKey}
          onChange={event => onCloudKeyChange(event.target.value)}
        />
      </div>
    );
  }

  if (mode === 'custom') {
    return (
      <div className={s.detail}>
        <p className={s.detailLabel}>Connect to a Supabase instance running on a specific machine or network.</p>
        <label className={s.fieldLabel}>Supabase URL</label>
        <input
          className={s.input}
          type="url"
          placeholder="http://192.168.1.100:54321"
          value={customUrl}
          onChange={event => onCustomUrlChange(event.target.value)}
          autoFocus
        />
        <label className={s.fieldLabel}>Service Role Key</label>
        <input
          className={s.input}
          type="password"
          placeholder="eyJhbGciOiJIUzI1NiIs..."
          value={customKey}
          onChange={event => onCustomKeyChange(event.target.value)}
        />
      </div>
    );
  }

  return null;
}
