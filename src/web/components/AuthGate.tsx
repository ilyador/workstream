import { useState } from 'react';
import s from './AuthGate.module.css';

interface Props {
  onAuth: (action: 'signIn' | 'signUp', email: string, password: string, name?: string) => Promise<void>;
}

export function AuthGate({ onAuth }: Props) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'signup') {
        await onAuth('signUp', email, password, name);
      } else {
        await onAuth('signIn', email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={s.container}>
      <h1 className={s.title}>WorkStream</h1>
      <p className={s.subtitle}>{mode === 'signin' ? 'Sign in to continue' : 'Create your account'}</p>

      <form className={s.form} onSubmit={handleSubmit}>
        {error && <div className={s.error}>{error}</div>}

        {mode === 'signup' && (
          <input
            className={s.input}
            type="text"
            name="name"
            autoComplete="name"
            placeholder="Full name"
            value={name}
            onChange={e => setName(e.target.value)}
            required
          />
        )}
        <input
          className={s.input}
          type="email"
          name="email"
          autoComplete="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
        />
        <input
          className={s.input}
          type="password"
          name="password"
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          minLength={6}
        />
        <button className={`btn btnPrimary ${s.submitWrap}`} type="submit" disabled={loading}>
          {loading ? '...' : mode === 'signin' ? 'Sign In' : 'Create Account'}
        </button>
      </form>

      <p className={s.toggle}>
        {mode === 'signin' ? (
          <>No account? <button className={s.link} onClick={() => { setMode('signup'); setError(''); }}>Create one</button></>
        ) : (
          <>Have an account? <button className={s.link} onClick={() => { setMode('signin'); setError(''); }}>Sign in</button></>
        )}
      </p>
    </div>
  );
}
