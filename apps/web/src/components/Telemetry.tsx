'use client';

import { Analytics, type BeforeSendEvent } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';

/**
 * Visitor statistics and real-user speed (Vercel Web Analytics and Speed Insights; no cookies, no personal data).
 * Before anything is sent, ids in addresses become ":id" (a contract, a player, a game are not tracked one by one) and
 * only the campaign tags of a link (utm_*, e.g. from a social media post) are kept from its query.
 */
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
function clean<T extends { url: string }>(event: T): T {
  try {
    const u = new URL(event.url);
    u.pathname = u.pathname.replace(UUID, ':id').replace(/\/\d{4,}(?=\/|$)/g, '/:id');
    const keep = new URLSearchParams();
    for (const [k, v] of u.searchParams) if (k.startsWith('utm_')) keep.set(k, v.slice(0, 80));
    u.search = keep.toString();
    u.hash = '';
    return { ...event, url: u.toString() };
  } catch {
    return event;
  }
}

export function Telemetry() {
  return (
    <>
      <Analytics beforeSend={(e: BeforeSendEvent) => clean(e)} />
      <SpeedInsights beforeSend={(e) => clean(e)} />
    </>
  );
}
