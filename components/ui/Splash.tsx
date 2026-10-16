'use client';
import { useEffect, useState } from 'react';

/** Approved splash: ~3.6s, 0.6s fade-out, click to skip. */
export function Splash() {
  const [state, setState] = useState<'show' | 'fade' | 'gone'>('show');
  const hide = () => setState((s) => (s === 'show' ? 'fade' : s));
  useEffect(() => {
    const t = setTimeout(hide, 3600);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (state === 'fade') {
      const t = setTimeout(() => setState('gone'), 600);
      return () => clearTimeout(t);
    }
  }, [state]);
  if (state === 'gone') return null;
  return (
    <div id="splash" onClick={hide} style={state === 'fade' ? { opacity: 0 } : undefined}>
      <div className="lg">
        <svg width="86" height="86" viewBox="0 0 86 86">
          <rect width="86" height="86" rx="20" fill="#10a37f" />
          <path d="M43 14 68 28v30L43 72 18 58V28z" fill="none" stroke="#fff" strokeWidth="3" />
          <text x="43" y="52" fontSize="26" fontWeight="800" fill="#fff" textAnchor="middle" fontFamily="Manrope">SR</text>
        </svg>
      </div>
      <h1>SR ENTERPRISES</h1>
      <p>Inventory • Billing • Analytics</p>
      <div className="bar"><i></i></div>
      <p style={{ fontSize: 12 }}>Initializing your workspace…</p>
    </div>
  );
}
