import { redirect } from 'next/navigation';
import { homeFor, requireMember } from '@/lib/auth';

/** app.afrofoot.club/ → the signed-in member's own area (admins → /admin, coaches → /coach, players → /me). */
export default async function Home() {
  const member = await requireMember();
  redirect(homeFor(member.role));
}
