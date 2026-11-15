'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { NavItem } from './AppShell';

/** Area navigation: a sidebar on wide screens, a scrollable row of tabs on phones. The current page is marked for screen readers. */
export function AreaNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  const current = (href: string) => (href === items[0]?.href ? path === href : path === href || path.startsWith(`${href}/`));
  return (
    <nav className="-mx-4 overflow-x-auto px-4 md:mx-0 md:w-52 md:shrink-0 md:overflow-visible md:px-0">
      <ul className="flex gap-2 md:flex-col md:gap-1">
        {items.map((i) => (
          <li key={i.href}>
            <Link href={i.href} aria-current={current(i.href) ? 'page' : undefined}
              className={`flex min-h-10 items-center justify-between gap-3 whitespace-nowrap rounded-full px-4 text-sm font-semibold md:rounded-control ${current(i.href) ? 'bg-accent text-on-accent' : 'bg-raised text-fg hover:bg-accent/10'}`}>
              {i.label}
              {i.badge ? <span className="rounded-full bg-ink-950 px-2 text-xs font-bold text-white">{i.badge}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
