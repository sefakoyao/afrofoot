import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import type { Area } from '@afrofoot/db';
import type { Member } from '@/lib/auth';
import { signOut } from '@/app/actions/auth';
import { LanguageSwitcher } from './LanguageSwitcher';
import { Logo } from './Logo';

const SURFACE: Record<Area, 'admin' | 'coach' | 'player'> = { admin: 'admin', coach: 'coach', me: 'player' };
const TITLE: Record<Area, 'areaAdmin' | 'areaCoach' | 'areaPlayer'> = { admin: 'areaAdmin', coach: 'areaCoach', me: 'areaPlayer' };

/** Shared frame for the signed-in areas: black bar with logo, area name, account (name, role), languages and sign-out. */
export async function AppShell({ area, member, children }: { area: Area; member: Member; children: ReactNode }) {
  const [t, tn, tr] = await Promise.all([getTranslations('app'), getTranslations('nav'), getTranslations('role')]);
  const name = `${member.firstName} ${member.lastName}`.trim() || member.email;
  return (
    <div data-surface={SURFACE[area]} className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-50 focus:rounded-full focus:bg-accent focus:px-4 focus:py-2 focus:text-on-accent">{t('skipToContent')}</a>
      <header className="bg-ink-950 text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <span className="flex items-center gap-2 font-display font-extrabold"><Logo size={36} /> {t(TITLE[area])}</span>
          <div className="ms-auto flex flex-wrap items-center gap-3">
            <span className="text-sm">
              <span className="font-semibold">{name}</span>
              <span className="ms-2 rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-on-accent">{tr(member.role)}</span>
            </span>
            <LanguageSwitcher />
            <form action={signOut}>
              <button type="submit" className="min-h-9 rounded-full border-2 border-white/70 px-4 text-sm font-bold hover:bg-white hover:text-ink-950">{tn('logout')}</button>
            </form>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}

/** Unicode first-strong isolate: a Latin name or email inside Arabic text keeps its own direction (like <bdi>). */
const isolate = (s: string) => `\u2068${s}\u2069`;

/** Placeholder home for each area until its tools are built (Phase 2, step 4). */
export async function AreaHome({ member }: { member: Member }) {
  const t = await getTranslations('app');
  return (
    <section className="rounded-card border border-line bg-raised p-6">
      <h1 className="font-display text-2xl font-extrabold">{t('welcome', { name: isolate(member.firstName || member.email) })}</h1>
      <p className="mt-1 text-sm text-muted">{t('signedInAs', { email: isolate(member.email) })}</p>
      <p className="mt-4">{t('comingSoon')}</p>
    </section>
  );
}
