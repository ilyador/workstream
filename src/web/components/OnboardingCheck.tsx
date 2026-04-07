import { useEffect, useState } from 'react';
import { fetchOnboarding } from '../lib/api';
import s from './OnboardingCheck.module.css';

interface Check {
  id: string;
  label: string;
  ok: boolean;
  help: string;
  required: boolean;
}

export function OnboardingCheck({ onReady }: { onReady: () => void }) {
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchOnboarding()
      .then(data => {
        setChecks(data.checks);
        setReady(data.ready);
        if (data.ready) onReady();
      })
      .catch(() => setError('Cannot connect to WorkStream server. Is it running on port 3001?'));
  }, [onReady]);

  if (error) {
    return (
      <div className={s.container}>
        <h1 className={s.title}>WorkStream</h1>
        <div className={s.error}>{error}</div>
        <p className={s.hint}>Start the server: <code>pnpm dev:server</code></p>
      </div>
    );
  }

  if (!checks) {
    return (
      <div className={s.container}>
        <h1 className={s.title}>WorkStream</h1>
        <p className={s.loading}>Checking environment...</p>
      </div>
    );
  }

  if (ready) return null;

  return (
    <div className={s.container}>
      <h1 className={s.title}>WorkStream</h1>
      <p className={s.subtitle}>Let's make sure everything is set up.</p>

      <div className={s.list}>
        {checks.map(check => (
          <div key={check.id} className={`${s.item} ${check.ok ? s.ok : s.fail}`}>
            <span className={s.icon}>{check.ok ? '✓' : '✗'}</span>
            <div className={s.itemContent}>
              <span className={s.label}>
                {check.label}
                {!check.required && <span className={s.optional}>optional</span>}
              </span>
              {!check.ok && <p className={s.help}>{check.help}</p>}
            </div>
          </div>
        ))}
      </div>

      <button className="btn btnPrimary" onClick={() => window.location.reload()}>
        Re-check
      </button>
    </div>
  );
}
