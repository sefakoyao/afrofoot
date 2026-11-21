'use client';

import { useEffect } from 'react';

/** After a save, brings the place that was just added or edited into view (and lets the reader start from it). */
export function ScrollIntoView({ id }: { id: string }) {
  useEffect(() => { document.getElementById(id)?.scrollIntoView({ block: 'center' }); }, [id]);
  return null;
}
