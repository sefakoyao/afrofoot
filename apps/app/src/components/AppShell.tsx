import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import type { Area } from '@afrofoot/db';
import type { Member } from '@/lib/auth';
import { signOut } from '@/app/actions/auth';
import { LanguageSwitcher } from './LanguageSwitcher';
import { Logo } from './Logo';
import { AreaNav } from './AreaNav';
import { PitchWatermark } from './PitchWatermark';

const SURFACE: Record<Area, 'admin' | 'coach' | 'player'> = { admin: 'admin', coach: 'coach', me: 'player' };
const TITLE: Record<Area, 'areaAdmin' | 'areaCoach' | 'areaPlayer'> = { admin: 'areaAdmin', coach: 'areaCoach', me: 'areaPlayer' };

export interface NavItem { href: string; label: string; badge?: number }

/** Shared frame for the signed-in areas: black bar with logo, area name, account (name, role), languages and sign-out; optional area navigation; faint pitch lines behind the page. */
export async function AppShell({ area, member, nav, children }: { area: Area; member: Member; nav?: NavItem[]; children: ReactNode }) {
  const [t, tn, tr] = await Promise.all([getTranslations('app'), getTranslations('nav'), getTranslations('role')]);
  const name = `${member.firstName} ${member.lastName}`.trim() || member.email;
  return (
    <div data-surface={SURFACE[area]} className="relative isolate flex min-h-screen flex-col">
      <PitchWatermark />
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-50 focus:rounded-full focus:bg-accent focus:px-4 focus:py-2 focus:text-on-accent">{t('skipToContent')}</a>
      <header className="bg-ink-950 text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <span className="flex items-center gap-2 font-display font-extrabold"><Logo size={36} /> {t(TITLE[area])}</span>
          <div className="ms-auto flex flex-wrap items-center gap-3">
            <span className="text-sm">
              <a href="/account" className="font-semibold underline-offset-4 hover:underline" title={t('myAccount')}>{name}</a>
              <span className="ms-2 rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-on-accent">{tr(member.role)}</span>
            </span>
            <LanguageSwitcher />
            <form action={signOut}>
              <button type="submit" className="min-h-9 rounded-full border-2 border-white/70 px-4 text-sm font-bold hover:bg-white hover:text-ink-950">{tn('logout')}</button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 md:flex-row md:py-8">
        {nav ? <AreaNav items={nav} /> : null}
        <main id="main" className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
