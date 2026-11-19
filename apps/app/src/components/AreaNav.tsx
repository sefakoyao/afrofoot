'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import type { NavItem } from './AppShell';
import { NavIcon } from './NavIcon';
import { usePendingHref } from './usePendingHref';

/**
 * Area navigation: a sidebar on wide screens, a scrollable row of tabs on phones. The current page is marked for screen readers.
 * A tapped item is highlighted at once and shows a small spinner until its page arrives.
 * Consecutive items with the same `group` form a section that opens and closes (an accordion): only the section that
 * holds the current page is open; opening another one closes it. A closed section shows the sum of its items' badges.
 */
export function AreaNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  const { pending, onNavigate } = usePendingHref();
  const uid = useId();
  const exact = new Set(items.filter((i) => i.exact).map((i) => i.href));
  const onPage = (href: string) => (href === items[0]?.href || exact.has(href) ? path === href : path === href || path.startsWith(`${href}/`));
  const current = (href: string) => (pending ? pending === href : onPage(href));

  // consecutive entries with the same group become one section
  const sections: { group?: string; items: NavItem[] }[] = [];
  for (const i of items) {
    const last = sections.at(-1);
    if (i.group && last?.group === i.group) last.items.push(i); else sections.push({ group: i.group, items: [i] });
  }
  const activeGroup = sections.find((s) => s.group && s.items.some((i) => onPage(i.href)))?.group ?? null;
  const [open, setOpen] = useState<string | null>(activeGroup);
  // a new page: the section holding it is the open one
  useEffect(() => setOpen(activeGroup), [activeGroup, path]);
  // phones: the menu is one scrolling row, so bring the open section (its toggle and items) into view
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = navRef.current;
    if (!nav || nav.scrollWidth <= nav.clientWidth) return; // sidebar on wide screens: nothing to scroll
    const el = nav.querySelector<HTMLElement>('[data-nav-group][data-open]') ?? nav.querySelector<HTMLElement>('a[aria-current="page"]');
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el?.scrollIntoView({ inline: 'start', block: 'nearest', behavior: smooth ? 'smooth' : 'auto' });
  }, [open]);

  const link = (i: NavItem) => (
    <Link href={i.href} onClick={onNavigate(i.href)} aria-current={onPage(i.href) ? 'page' : undefined} aria-busy={pending === i.href || undefined} data-pending={pending === i.href || undefined}
      className={`flex min-h-10 items-center justify-between gap-3 whitespace-nowrap rounded-full px-4 text-sm font-semibold transition duration-100 active:scale-[.97] md:rounded-control ${current(i.href) ? 'bg-accent text-on-accent' : 'bg-raised text-fg hover:bg-accent/10'}`}>
      <span className="flex items-center gap-2.5">{i.icon ? <NavIcon name={i.icon} /> : null}{i.label}</span>
      {pending === i.href ? <Spinner /> : null}
      {i.badge ? <span className="rounded-full bg-ink-950 px-2 text-xs font-bold text-white">{i.badge}</span> : null}
    </Link>
  );

  return (
    <nav ref={navRef} className="-mx-4 scroll-px-4 overflow-x-auto px-4 md:mx-0 md:w-52 md:shrink-0 md:overflow-visible md:px-0">
      <ul className="flex items-center gap-2 md:flex-col md:items-stretch md:gap-1">
        {sections.map((sec, n) => {
          if (!sec.group) return sec.items.map((i) => <li key={i.href} className={n > 0 && sections[n - 1]?.group ? 'md:mt-1' : undefined}>{link(i)}</li>);
          const isOpen = open === sec.group, holdsPage = activeGroup === sec.group;
          const badges = sec.items.reduce((a, i) => a + (i.badge ?? 0), 0);
          const listId = `${uid}-g${n}`;
          return (
            <li key={`g${n}`} className="flex items-center gap-2 md:mt-1 md:flex-col md:items-stretch md:gap-1" data-nav-group={sec.group} data-open={isOpen || undefined}>
              <button type="button" aria-expanded={isOpen} aria-controls={listId} onClick={() => setOpen(isOpen ? null : sec.group!)} data-nav-toggle={sec.group}
                className={`flex min-h-10 items-center justify-between gap-2 whitespace-nowrap rounded-full border-2 px-4 text-sm font-bold transition-colors md:rounded-control md:border-0 md:px-4 ${isOpen ? 'border-transparent bg-surface md:bg-transparent' : 'border-line bg-raised hover:border-accent md:bg-transparent md:hover:bg-accent/10'} ${holdsPage ? 'text-pitch' : 'text-fg'}`}>
                <span className="flex items-center gap-2">{sec.items[0]?.groupIcon ? <NavIcon name={sec.items[0].groupIcon} className="size-4 md:hidden" /> : null}<span className="md:text-xs md:uppercase md:tracking-widest">{sec.group}</span></span>
                <span className="flex items-center gap-2">
                  {!isOpen && badges ? <span className="rounded-full bg-ink-950 px-2 text-xs font-bold text-white" data-group-badge>{badges}</span> : null}
                  <Chevron open={isOpen} />
                </span>
              </button>
              <ul id={listId} hidden={!isOpen} className={`${isOpen ? 'flex' : 'hidden'} gap-2 md:flex-col md:gap-1 md:border-s-2 md:border-line md:ps-2`}>
                {sec.items.map((i) => <li key={i.href}>{link(i)}</li>)}
              </ul>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Points down when the section is closed, up when open; the same in right-to-left. */
function Chevron({ open }: { open: boolean }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className={`size-4 shrink-0 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m4 6 4 4 4-4" />
    </svg>
  );
}

/** Small spinning ring for a link whose page is on its way. */
export function Spinner() {
  return <span aria-hidden className="inline-block size-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none" />;
}
