'use client';
import { FormEvent, useState } from 'react';
import { api } from '@/lib/client/api';
import { useToast } from '@/components/ui/Providers';

export default function LoginPage() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const u = await api<{ theme?: string }>('/api/auth/login', {
        method: 'POST',
        body: { email: f.get('email'), password: f.get('password'), remember: f.get('remember') === 'on' }
      });
      if (u?.theme && !localStorage.srt) localStorage.srt = u.theme;
      window.location.href = '/dashboard';
    } catch (err) {
      toast((err as Error).message, true);
      setBusy(false);
    }
  }
  return (
    <div className="login">
      <form className="card" onSubmit={submit}>
        <div className="brand">
          <svg width="34" height="34" viewBox="0 0 86 86" aria-hidden>
            <rect width="86" height="86" rx="20" fill="#10a37f" />
            <text x="43" y="56" fontSize="34" fontWeight="800" fill="#fff" textAnchor="middle">SR</text>
          </svg>
          <div>SR<br /><small style={{ fontWeight: 400 }}>ENTERPRISES</small></div>
        </div>
        <p style={{ color: 'var(--mut)', margin: '4px 0 6px' }}>Sign in to your workspace</p>
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" required autoFocus />
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '14px 0' }}>
          <input name="remember" type="checkbox" style={{ width: 'auto' }} /> Remember this device
        </label>
        <button className="p" style={{ width: '100%' }} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
}
