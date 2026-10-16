import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/guard';
import { getBusiness } from '@/lib/business';
import { prisma } from '@/lib/db/prisma';
import { AppShell } from '@/components/layout/AppShell';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionUser();
  if (!session) redirect('/login');
  const [business, u] = await Promise.all([getBusiness(), prisma.user.findUnique({ where: { id: session.id }, select: { theme: true } })]);
  if (!u) redirect('/login'); // user was removed
  return (
    <AppShell user={session} business={business} theme={u.theme}>
      {children}
    </AppShell>
  );
}
