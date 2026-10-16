
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/client/api';
import type { BusinessDTO } from '@/lib/types';
import { useToast } from '@/components/ui/Providers';
import { useShell } from '@/components/layout/AppShell';

const FIELDS: [keyof BusinessDTO, string][] = [
  ['name', 'Business Name'],
  ['address', 'Address'],
  ['phone', 'Phone'],
  ['email', 'Email'],
  ['gstin', 'GSTIN'],
  ['state', 'State'],
  ['pincode', 'Pincode'],
  ['invoicePrefix', 'Invoice Prefix'],
  ['lowStockThreshold', 'Low Stock Threshold'],
  ['tagline', 'Receipt Tagline'],
];

export default function SettingsPage() {
  const { business, user, toggleTheme } = useShell();
  const router = useRouter();
  const toast = useToast();

  const [f, setF] = useState<BusinessDTO>(business);
  const [busy, setBusy] = useState(false);

  const admin = user.role === 'ADMIN';

  async function save() {
    setBusy(true);

    try {
      await api('/api/business', {
        method: 'PUT',
        body: {
          ...f,
          lowStockThreshold: +f.lowStockThreshold,
        },
      });

      toast('Settings saved');
      router.refresh();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    window.location.href = '/login';
  }

  return (
    <div className="card" style={{ maxWidth: 600 }}>
      <div className="f">
        {FIELDS.map(([k, l]) => (
          <div key={k}>
            <label htmlFor={`s_${k}`}>{l}</label>
            <input
              id={`s_${k}`}
              value={String(f[k] ?? '')}
              type={k === 'lowStockThreshold' ? 'number' : 'text'}
              disabled={!admin}
              onChange={(e) =>
                setF({ ...f, [k]: e.target.value })
              }
            />
          </div>
        ))}
      </div>

      <div className="bar" style={{ marginTop: 14 }}>
        {admin && (
          <button className="p" onClick={save} disabled={busy}>
            {busy ? 'Saving...' : 'Save'}
          </button>
        )}

        <button onClick={toggleTheme}>Toggle Dark Mode</button>

        <button className="d" onClick={logout}>
          Sign out
        </button>
      </div>

      {!admin && (
        <p>
          <small>Only administrators can change business settings.</small>
        </p>
      )}

      <small>
        Shortcuts: Ctrl+K search · Ctrl+B new bill · Esc close
      </small>
    </div>
  );
}
