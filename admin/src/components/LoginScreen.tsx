import { useState } from 'react';
import { login } from '../lib/api';

export function LoginScreen({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(password);
      onSuccess();
    } catch {
      setError('Incorrect password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-xl border border-surface-border bg-surface-raised p-8 shadow-xl"
      >
        <h1 className="text-xl font-semibold text-slate-100">Chain Duel Ops</h1>
        <p className="mt-1 text-sm text-slate-400">Sign in with your admin password</p>
        <label className="mt-6 block text-sm">
          <span className="text-slate-400">Password</span>
          <input
            type="password"
            autoComplete="current-password"
            className="mt-1 w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-slate-100 outline-none focus:border-accent"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
        <button
          type="submit"
          disabled={loading || !password}
          className="mt-6 w-full rounded-lg bg-accent px-4 py-2.5 font-medium text-surface hover:bg-accent-muted disabled:opacity-50"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
