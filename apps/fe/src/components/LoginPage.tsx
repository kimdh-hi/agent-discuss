import { useState } from 'react';
import { apiFetch } from '../lib/api';
import type { User } from '../lib/types';

interface Props {
  onLogin: (token: string, user: User) => void;
}

export default function LoginPage({ onLogin }: Props) {
  const [email, setEmail] = useState('test@test.com');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ token: string; user: User }>('/auth/dev-login', {
        method: 'POST',
        body: { email: email.trim() },
      });
      onLogin(res.token, res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인 실패');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-zinc-900 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">RAI Agent</h1>
          <p className="mt-1.5 text-sm text-zinc-400">워크스페이스 기반 멀티 에이전트</p>
        </div>

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="card space-y-4 p-6"
        >
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-zinc-400" htmlFor="email">
              이메일
            </label>
            <input
              id="email"
              type="email"
              className="input-base"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="test@test.com"
              autoFocus
            />
          </div>

          {error && (
            <p role="alert" className="text-xs text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="btn btn-primary w-full"
            disabled={loading || !email.trim()}
          >
            {loading ? '로그인 중…' : 'Dev 로그인'}
          </button>
        </form>
      </div>
    </div>
  );
}
