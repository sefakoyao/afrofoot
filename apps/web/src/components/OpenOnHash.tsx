'use client';

import { useEffect } from 'react';

/** Opens the <details> inside the element whose id is in the URL hash (and on every hash change), then scrolls to it. */
export function OpenOnHash({ ids }: { ids: string[] }) {
  useEffect(() => {
    const open = () => {
      const id = window.location.hash.slice(1);
      if (!ids.includes(id)) return;
      const el = document.getElementById(id);
      el?.querySelector('details')?.setAttribute('open', '');
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    open();
    window.addEventListener('hashchange', open);
    return () => window.removeEventListener('hashchange', open);
  }, [ids]);
  return null;
}
