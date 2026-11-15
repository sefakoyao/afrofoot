'use client';

import { useEffect, useState, type MouseEvent } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Optimistic tab: the tapped tab looks selected straight away, before the server has answered, and goes back to normal
 * as soon as the new page is shown. Clicks that open a new tab or window are left alone.
 */
export function usePendingHref() {
  const path = usePathname();
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => setPending(null), [path]);
  const onNavigate = (href: string) => (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    setPending(href === path ? null : href);
  };
  return { pending, onNavigate };
}
