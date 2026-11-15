'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { NavItem } from './AppShell';
import { usePendingHref } from './usePendingHref';

/**
 * Area navigation: a sidebar on wide screens, a scrollable row of tabs on phones. The current page is marked for screen readers.
 * A tapped item is highlighted at once and shows a small spinner until its page arrives.
 */
export function AreaNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  const { pending, onNavigate } = usePendingHref();
  const onPage = (href: string) => (href === items[0]?.href ? path === href : path === href || path.startsWith(`${href}/`));
  const current = (href: string) => (pending ? pending === href : onPage(href));
  return (
    <nav className="-mx-4 overflow-x-auto px-4 md:mx-0 md:w-52 md:shrink-0 md:overflow-visible md:px-0">
      <ul className="flex gap-2 md:flex-col md:gap-1">
        {items.map((i) => (
          <li key={i.href}>
            <Link href={i.href} onClick={onNavigate(i.href)} aria-current={onPage(i.href) ? 'page' : undefined} aria-busy={pending === i.href || undefined} data-pending={pending === i.href || undefined}
              className={`flex min-h-10 items-center justify-between gap-3 whitespace-nowrap rounded-full px-4 text-sm font-semibold transition duration-100 active:scale-[.97] md:rounded-control ${current(i.href) ? 'bg-accent text-on-accent' : 'bg-raised text-fg hover:bg-accent/10'}`}>
              {i.label}
              {pending === i.href ? <Spinner /> : null}
              {i.badge ? <span className="rounded-full bg-ink-950 px-2 text-xs font-bold text-white">{i.badge}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Small spinning ring for a link whose page is on its way. */
export function Spinner() {
  return <span aria-hidden className="inline-block size-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none" />;
}
