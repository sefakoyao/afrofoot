import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { canEnter, type Area } from '@afrofoot/db';
import type { Member } from '@/lib/auth';
import { signOut } from '@/app/actions/auth';
import { LanguageSwitcher } from './LanguageSwitcher';
import { Logo } from './Logo';
import { AreaNav } from './AreaNav';
import { BottomBar, type TabItem } from './BottomBar';
import type { NavIconName } from './NavIcon';
import { PitchWatermark } from './PitchWatermark';
import { IdleGuard } from './IdleGuard';
import { idleMinutes } from '@/lib/idle';
import { getSupabase } from '@/lib/supabase/server';

const SURFACE: Record<Area, 'admin' | 'coach' | 'player'> = { admin: 'admin', coach: 'coach', me: 'player' };
const TITLE: Record<Area, 'areaAdmin' | 'areaCoach' | 'areaPlayer'> = { admin: 'areaAdmin', coach: 'areaCoach', me: 'areaPlayer' };
/** Main page of each area: the logo and area name lead back there. */
const HOME: Record<Area, string> = { admin: '/admin', coach: '/coach', me: '/me' };

/** A menu entry. Entries that share a `group` are shown together under that heading (e.g. the coach's "My teams"). */
export interface NavItem { href: string; label: string; badge?: number; group?: string; /** menu icon (components/NavIcon) */ icon?: NavIconName; /** the icon of the item's group heading */ groupIcon?: NavIconName; /** only this exact address marks it current (a section's overview) */ exact?: boolean }

/**
 * Shared frame for the signed-in areas (Alternative A, app layout): a slim black bar with the crest, the area name and an
 * account menu (name, role, my account, the other area, website, language, sign out); the area menu as a sidebar on wide
 * screens and, on phones, a bar at the bottom of the screen (`tabs`) with "More" for the rest; faint pitch lines behind.
 */
export async function AppShell({ area, member, nav, tabs, children }: { area: Area; member: Member; nav?: NavItem[]; tabs?: TabItem[]; children: ReactNode }) {
  const [t, tn, tr] = await Promise.all([getTranslations('app'), getTranslations('nav'), getTranslations('role')]);
  const name = `${member.firstName} ${member.lastName}`.trim() || member.email || member.phone || '';
  const initials = (`${member.firstName[0] ?? ''}${member.lastName[0] ?? ''}`.trim() || name.slice(0, 1)).toUpperCase();
  // 0064: the club's communications people (not admins) reach the website pages from any area
  const supabase = area !== 'admin' ? await getSupabase() : null;
  const publisher = supabase ? !!(await supabase.rpc('can_publish')).data : false;
  return (
    <div data-surface={SURFACE[area]} className="relative isolate flex min-h-screen flex-col">
      <PitchWatermark />
      <IdleGuard minutes={idleMinutes()} />
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-50 focus:rounded-full focus:bg-accent focus:px-4 focus:py-2 focus:text-on-accent">{t('skipToContent')}</a>
      <header className="sticky top-0 z-30 bg-ink-950 text-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <a href={HOME[area]} title={t('homeLink')} data-home-link className="flex min-h-11 min-w-0 items-center gap-2 rounded-full font-display font-extrabold hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"><Logo size={30} /> <span className="truncate">{t(TITLE[area])}</span></a>
          {/* a player-coach moves between their coaching pages and their own player pages (also in the account menu) */}
          {area === 'coach' && canEnter(member.role, 'me') ? <a href="/me" className="hidden rounded-full bg-white/10 px-3 py-1.5 text-sm font-bold hover:bg-white hover:text-ink-950 sm:inline-block" data-area-switch="me">{t('switchToPlayer')}</a> : null}
          {area === 'me' && canEnter(member.role, 'coach') ? <a href="/coach" className="hidden rounded-full bg-white/10 px-3 py-1.5 text-sm font-bold hover:bg-white hover:text-ink-950 sm:inline-block" data-area-switch="coach">{t('switchToCoach')}</a> : null}
          <details className="group relative ms-auto" data-account-menu>
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-full ps-1 pe-1 hover:bg-white/10 sm:pe-3 [&::-webkit-details-marker]:hidden" aria-label={t('myAccount')}>
              <span className="grid size-9 place-items-center rounded-full bg-accent font-display text-sm font-extrabold text-on-accent" aria-hidden>{initials}</span>
              <span className="hidden max-w-40 truncate text-sm font-semibold sm:inline">{name}</span>
            </summary>
            <div className="absolute end-0 top-12 z-40 grid w-72 gap-1 rounded-card bg-raised p-3 text-fg shadow-2xl ring-1 ring-line">
              <div className="px-2 pb-2">
                <p className="truncate font-display font-extrabold"><bdi>{name}</bdi></p>
                <span className="mt-1 inline-block rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-on-accent">{tr(member.role)}</span>
              </div>
              <a href="/account" className="flex min-h-11 items-center rounded-control px-2 font-semibold hover:bg-accent/10" data-account-link>{t('myAccount')}</a>
              {area === 'coach' && canEnter(member.role, 'me') ? <a href="/me" className="flex min-h-11 items-center rounded-control px-2 font-semibold hover:bg-accent/10">{t('switchToPlayer')}</a> : null}
              {area === 'me' && canEnter(member.role, 'coach') ? <a href="/coach" className="flex min-h-11 items-center rounded-control px-2 font-semibold hover:bg-accent/10">{t('switchToCoach')}</a> : null}
              {publisher ? <a href="/content" className="flex min-h-11 items-center rounded-control px-2 font-semibold hover:bg-accent/10" data-content-link>{t('websiteLink')}</a> : null}
              <div className="flex items-center justify-between gap-2 rounded-control bg-ink-950 px-2 py-1.5"><span className="text-sm font-semibold text-white">{tn('language')}</span><LanguageSwitcher /></div>
              <form action={signOut} className="pt-1">
                <button type="submit" className="min-h-11 w-full rounded-full border-2 border-fg px-4 text-sm font-bold hover:bg-fg hover:text-raised">{tn('logout')}</button>
              </form>
            </div>
          </details>
        </div>
      </header>
      <div className={`mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-4 md:flex-row md:py-8 ${tabs ? 'pb-28 md:pb-8' : ''}`}>
        {/* the sidebar on wide screens; on phones the bottom bar (with More) replaces it */}
        {nav ? <div className={tabs ? 'hidden md:block md:shrink-0' : 'md:shrink-0'}><AreaNav items={nav} /></div> : null}
        <main id="main" className="min-w-0 flex-1">{children}</main>
      </div>
      {tabs ? <BottomBar tabs={tabs} more={nav} moreLabel={tn('more')} closeLabel={tn('close')} /> : null}
    </div>
  );
}
