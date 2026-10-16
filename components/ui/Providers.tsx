'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';

type ToastFn = (m: string, error?: boolean) => void;
interface ModalApi { open: (node: ReactNode) => void; close: () => void; isOpen: boolean }

const ToastCtx = createContext<ToastFn>(() => {});
const ModalCtx = createContext<ModalApi>({ open() {}, close() {}, isOpen: false });
export const useToast = () => useContext(ToastCtx);
export const useModal = () => useContext(ModalCtx);

export function Providers({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<{ id: number; m: string; e?: boolean }[]>([]);
  const [content, setContent] = useState<ReactNode>(null);
  const [on, setOn] = useState(false);
  const idRef = useRef(0);
  const lastFocus = useRef<HTMLElement | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const toast = useCallback<ToastFn>((m, e) => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, m, e }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800);
  }, []);
  const open = useCallback((node: ReactNode) => {
    if (!document.querySelector('#modal.on')) lastFocus.current = document.activeElement as HTMLElement;
    setContent(node);
    setOn(true);
  }, []);
  const close = useCallback(() => {
    setOn(false);
    setContent(null);
    lastFocus.current?.focus?.();
  }, []);

  // Esc closes; focus moves into the dialog when it opens.
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [close]);
  useEffect(() => {
    if (on) boxRef.current?.querySelector<HTMLElement>('input,select,button')?.focus({ preventScroll: true });
  }, [on]);

  return (
    <ToastCtx.Provider value={toast}>
      <ModalCtx.Provider value={{ open, close, isOpen: on }}>
        {children}
        <div id="modal" role="dialog" aria-modal="true" className={on ? 'on' : ''}>
          <div ref={boxRef}>{content}</div>
        </div>
        <div id="toast" role="status" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={t.e ? 'e' : ''}>{t.m}</div>
          ))}
        </div>
      </ModalCtx.Provider>
    </ToastCtx.Provider>
  );
}
