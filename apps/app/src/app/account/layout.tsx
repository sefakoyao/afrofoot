import type { ReactNode } from 'react';
import type { Area } from '@afrofoot/db';
import { AppShell } from '@/components/AppShell';
import { homeFor, requireMember } from '@/lib/auth';

/** Every signed-in member has an account page; it uses the frame of their own area. */
export default async function Layout({ children }: { children: ReactNode }) {
  const member = await requireMember('/account');
  const area = homeFor(member.role).slice(1) as Area;
  return <AppShell area={area} member={member}>{children}</AppShell>;
}
