/** Who built the site and app, shown in both footers. */
export const CRAFTED_BY = 'Fazao Oy';

/** Current year in Finland, for the copyright line. */
export const yearNow = (): number => Number(new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Europe/Helsinki' }).format(new Date()));

/**
 * Release shown in the footers: the app's package.json version (kept equal to the latest app_releases row and the
 * CHANGELOG) and the deployed commit, both put in at build time by next.config (NEXT_PUBLIC_RELEASE, NEXT_PUBLIC_COMMIT).
 */
export const releaseLabel = (): string => {
  const v = process.env.NEXT_PUBLIC_RELEASE || '';
  const c = process.env.NEXT_PUBLIC_COMMIT || '';
  return [v ? `v${v}` : '', c].filter(Boolean).join(' · ');
};
