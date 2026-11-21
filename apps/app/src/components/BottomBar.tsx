'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { NavItem } from './AppShell';
import { NavIcon, type NavIconName } from './NavIcon';

/** One entry of the phone menu bar. */
export interface TabItem { href: string; label: string; icon: NavIconName; badge?: number; /** only this exact address marks it current */ exact?: boolean }

/**
 * Phone menu (Alternative A): a bar fixed to the bottom of the screen, within thumb reach, with the area's main pages;
 * "More" opens a sheet with every page of the area menu, grouped as in the sidebar. Hidden on wide screens (sidebar).
 */
export function BottomBar({ tabs, more, moreLabel, closeLabel }: { tabs: TabItem[]; more?: NavItem[]; moreLabel: string; closeLabel: string }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const on = (href: string, exact?: boolean) => (exact ? path === href : path === href || path.startsWith(`${href}/`));
  const tabOn = (x: TabItem) => (x.exact ? path === x.href : on(x.href) && !tabs.some((y) => y !== x && y.href.length > x.href.length && on(y.href)));
  const anyTab = tabs.some(tabOn);
  const moreBadge = (more ?? []).filter((i) => !tabs.some((x) => x.href === i.href)).reduce((a, i) => a + (i.badge ?? 0), 0);

  // the sheet: every page of the area, in its groups
  const groups: { group?: string; items: NavItem[] }[] = [];
  for (const i of more ?? []) { const last = groups.at(-1); if (i.group && last?.group === i.group) last.items.push(i); else groups.push({ group: i.group, items: [i] }); }

  const cell = 'relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 pt-1.5 text-[11px] font-bold leading-tight';
  return (
    <>
      {open && more ? (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label={moreLabel} data-more-sheet>
          <button type="button" className="absolute inset-0 bg-ink-950/40" aria-label={closeLabel} onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-[28px] bg-surface px-4 pb-28 pt-3 shadow-2xl">
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-line" aria-hidden />
            {groups.map((g, n) => (
              <section key={n} className="mb-3">
                {g.group ? <h2 className="mb-1 px-2 text-xs font-bold uppercase tracking-widest text-muted">{g.group}</h2> : null}
                <ul className="overflow-hidden rounded-card border border-line bg-raised">
                  {g.items.map((i) => (
                    <li key={i.href} className="border-b border-line last:border-0">
                      <Link href={i.href} aria-current={on(i.href, i.exact) ? 'page' : undefined}
                        className={`flex min-h-12 items-center gap-3 px-4 font-semibold ${on(i.href, i.exact) ? 'text-pitch' : ''}`}>
                        {i.icon ? <NavIcon name={i.icon} className="size-5" /> : null}<span className="flex-1">{i.label}</span>
                        {i.badge ? <span className="rounded-full bg-danger px-2 text-xs font-bold text-white">{i.badge}</span> : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      ) : null}
      <nav aria-label={moreLabel} className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-raised pb-[env(safe-area-inset-bottom)] md:hidden" data-bottom-bar>
        <ul className="mx-auto flex h-16 max-w-xl px-1">
          {tabs.map((x) => {
            const cur = !open && tabOn(x);
            return (
              <li key={x.href} className="flex min-w-0 flex-1">
                <Link href={x.href} aria-current={cur ? 'page' : undefined} className={`${cell} ${cur ? 'text-pitch' : 'text-muted'}`} data-tab={x.href}>
                  <span className={`grid h-8 w-14 place-items-center rounded-full transition ${cur ? 'bg-accent/15' : ''}`}><NavIcon name={x.icon} className="size-6" /></span>
                  <span className="max-w-full truncate px-0.5">{x.label}</span>
                  {x.badge ? <span className="absolute end-[22%] top-1 min-w-5 rounded-full bg-danger px-1.5 text-center text-[11px] font-bold text-white">{x.badge}</span> : null}
                </Link>
              </li>
            );
          })}
          {more ? (
            <li className="flex min-w-0 flex-1">
              <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className={`${cell} ${open || !anyTab ? 'text-pitch' : 'text-muted'}`} data-tab="more">
                <span className={`grid h-8 w-14 place-items-center rounded-full ${open || !anyTab ? 'bg-accent/15' : ''}`}><NavIcon name="more" className="size-6" /></span>
                <span>{moreLabel}</span>
                {moreBadge ? <span className="absolute end-[22%] top-1 min-w-5 rounded-full bg-danger px-1.5 text-center text-[11px] font-bold text-white">{moreBadge}</span> : null}
              </button>
            </li>
          ) : null}
        </ul>
      </nav>
    </>
  );
}
