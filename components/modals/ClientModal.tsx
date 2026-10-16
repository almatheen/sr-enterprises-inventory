'use client';
import { useState } from 'react';
import { api } from '@/lib/client/api';
import type { ClientDTO } from '@/lib/types';
import { useModal, useToast } from '@/components/ui/Providers';

export function ClientModal({ client, onDone }: { client?: ClientDTO; onDone?: () => void }) {
  const m = useModal();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    name: client?.name ?? '', phone: client?.phone ?? '', email: client?.email ?? '',
    gstin: client?.gstin ?? '', address: client?.addr ?? '', state: client?.state ?? ''
  });
  const fld = (k: keyof typeof f, label: string, id: string) => (
    <div>
      <label htmlFor={id}>{label}</label>
      <input id={id} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </div>
  );
  async function save() {
    if (!f.name.trim() || !/^\d{10}$/.test(f.phone.trim())) return toast('Enter name and 10-digit mobile', true);
    setBusy(true);
    try {
      const r = await api<{ existed?: boolean }>(client ? `/api/clients/${client.id}` : '/api/clients', { method: client ? 'PATCH' : 'POST', body: f });
      m.close();
      toast(r?.existed ? 'Customer already exists' : client ? 'Client updated' : 'Customer saved');
      onDone?.();
    } catch (e) {
      toast((e as Error).message, true);
      setBusy(false);
    }
  }
  return (
    <>
      <h3>{client ? 'Edit' : 'Add'} Client</h3>
      <div className="f">
        {fld('name', 'Name', 'cn1')}
        {fld('phone', 'Mobile', 'cp1')}
        {fld('email', 'Email', 'ce1')}
        {fld('gstin', 'GSTIN', 'cg1')}
        {fld('address', 'Address', 'ca1')}
        {fld('state', 'State', 'cs1')}
      </div>
      <div className="bar" style={{ marginTop: 12 }}>
        <button onClick={m.close}>Cancel</button>
        <button className="p" onClick={save} disabled={busy}>Save</button>
      </div>
    </>
  );
}
