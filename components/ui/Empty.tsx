import { ReactNode } from 'react';

export function Empty({ icon, title, text, children }: { icon: string; title: string; text: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="ic" aria-hidden>{icon}</div>
      <b>{title}</b>
      <p>{text}</p>
      {children}
    </div>
  );
}
