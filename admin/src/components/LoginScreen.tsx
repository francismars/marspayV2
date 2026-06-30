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
        className="glass-panel w-full max-w-sm rounded-xl p-8 shadow-xl backdrop-blur-md"
      >
        <h1 className="font-display text-center text-2xl uppercase tracking-wide text-white">
          Chain Duel
        </h1>
        <p className="mt-1 text-center text-sm text-white/50">Ops dashboard — sign in</p>
        <label className="mt-6 block text-sm">
          <span className="text-white/45">Password</span>
          <input
            type="password"
            autoComplete="current-password"
            className="mt-1 w-full rounded-lg border border-surface-border bg-black/40 px-3 py-2 text-white outline-none focus:border-accent"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
        <button
          type="submit"
          disabled={loading || !password}
          className="mt-6 w-full rounded-lg border border-white/40 bg-transparent px-4 py-2.5 font-medium uppercase tracking-wider text-white hover:border-accent hover:text-accent focus:border-accent disabled:opacity-50"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
