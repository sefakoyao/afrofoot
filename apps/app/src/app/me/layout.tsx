import type { ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';
import { requireArea } from '@/lib/auth';

export default async function Layout({ children }: { children: ReactNode }) {
  const member = await requireArea('me');
  return <AppShell area="me" member={member}>{children}</AppShell>;
}
