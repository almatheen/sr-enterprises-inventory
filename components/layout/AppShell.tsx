'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { BusinessDTO, SessionUser } from '@/lib/types';
import { api, useDebounced } from '@/lib/client/api';
import { STOCK_EVENT } from '@/lib/client/events';
import { useModal } from '@/components/ui/Providers';
import { StockAlerts } from '@/components/modals/StockAlerts';
import { SearchResults } from '@/components/modals/SearchResults';

export const I: Record<string, string> = { dashboard: '🏠', inventory: '📦', billing: '🧾', invoices: '📄', reports: '📊', clients: '👥', settings: '⚙️' };
export const PAGES: Record<string, string> = { dashboard: 'Dashboard', inventory: 'Inventory', billing: 'Billing', invoices: 'Invoices', reports: 'Reports & Analytics', clients: 'Clients', settings: 'Settings' };

interface Shell { user: SessionUser; business: BusinessDTO; refreshBadge: () => void; toggleTheme: () => void; badgeVersion: number }
const ShellCtx = createContext<Shell>(null as unknown as Shell);
export const useShell = () => useContext(ShellCtx);

export function AppShell({ user, business, theme, children }: { user: SessionUser; business: BusinessDTO; theme: string; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const modal = useModal();
  const key = pathname.split('/')[1] || 'dashboard';
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [v, setV] = useState(0);
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 250);
  const gs = useRef<HTMLInputElement>(null);

  const refreshBadge = useCallback(() => setV((x) => x + 1), []);

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    window.addEventListener(STOCK_EVENT, refreshBadge);
    return () => window.removeEventListener(STOCK_EVENT, refreshBadge);
  }, [refreshBadge]);
  useEffect(() => {
    api<{ count: number }>('/api/notifications').then((d) => setCount(d.count)).catch(() => {});
  }, [v, pathname]);

  // Theme: stored locally (instant) and on the user profile (follows the user across devices).
  useEffect(() => {
    if (!localStorage.srt) localStorage.srt = theme;
    document.documentElement.dataset.theme = localStorage.srt;
  }, [theme]);
  const toggleTheme = useCallback(() => {
    const d = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = d;
    localStorage.srt = d;
    api('/api/me', { method: 'PATCH', body: { theme: d } }).catch(() => {});
    router.refresh();
  }, [router]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === 'k') { e.preventDefault(); gs.current?.focus(); }
      if (mod && e.key === 'b') { e.preventDefault(); router.push('/billing'); }
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [router]);

  useEffect(() => {
    if (dq.trim().length >= 2) modal.open(<SearchResults q={dq.trim()} />);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq]);

  return (
    <ShellCtx.Provider value={{ user, business, refreshBadge, toggleTheme, badgeVersion: v }}>
      <div id="app">
        <aside id="sb" className={open ? 'open' : ''}>
          <div className="brand">
            <svg width="34" height="34" viewBox="0 0 86 86" aria-hidden>
              <rect width="86" height="86" rx="20" fill="#10a37f" />
              <text x="43" y="56" fontSize="34" fontWeight="800" fill="#fff" textAnchor="middle">SR</text>
            </svg>
            <div>SR<br /><small style={{ margin: 0, fontWeight: 400 }}>ENTERPRISES</small></div>
          </div>
          <nav id="nav" aria-label="Sidebar">
            {Object.keys(PAGES).map((k) => (
              <Link key={k} href={`/${k}`} className={k === key ? 'on' : ''} aria-current={k === key ? 'page' : undefined}>
                {I[k]} {PAGES[k]}
              </Link>
            ))}
          </nav>
          <small>{user.name} · {user.role === 'ADMIN' ? 'Admin' : 'Staff'}</small>
        </aside>
        <main>
          <header>
            <button id="menu" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>☰</button>
            <h2 id="ttl">{PAGES[key] ?? 'Dashboard'}</h2>
            <input
              id="gs"
              ref={gs}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search (Ctrl+K)"
              style={{ maxWidth: 240 }}
              aria-label="Global search"
            />
            <button id="bell" aria-label={`Notifications${count ? `, ${count} alerts` : ''}`} onClick={() => modal.open(<StockAlerts />)}>
              🔔 <span id="nb">{count || ''}</span>
            </button>
            <button id="th" aria-label="Toggle theme" onClick={toggleTheme}>◐</button>
          </header>
          <div id="page" key={pathname}>{children}</div>
        </main>
      </div>
      <nav id="bn" aria-label="Main">
        {Object.keys(PAGES).map((k) => (
          <Link key={k} href={`/${k}`} className={k === key ? 'on' : ''}>
            <div style={{ fontSize: 18 }}>{I[k]}</div>
            {PAGES[k].split(' ')[0]}
          </Link>
        ))}
      </nav>
    </ShellCtx.Provider>
  );
}
