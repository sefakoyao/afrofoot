import { TIME_ZONE } from '@afrofoot/i18n';

/** Offset of Europe/Helsinki from UTC at a given instant, in minutes (+120 in winter, +180 in summer). */
function offsetMinutes(utcMs: number): number {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs)).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!, +parts.hour!, +parts.minute!, +parts.second!);
  return Math.round((asUtc - utcMs) / 60_000);
}

/** "2026-11-20" + "18:30" in Helsinki → UTC ISO string. Works across the summer-time change. */
export function helsinkiToIso(date: string, time: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const [hh, mm] = time.split(':').map(Number) as [number, number];
  const naive = Date.UTC(y, m - 1, d, hh, mm);
  let utc = naive - offsetMinutes(naive) * 60_000;
  utc = naive - offsetMinutes(utc) * 60_000; // second pass settles the offset near a change
  return new Date(utc).toISOString();
}

/** Today's date in Helsinki as YYYY-MM-DD. */
export const helsinkiToday = (now = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

/** Add days to a YYYY-MM-DD date. */
export const addDays = (date: string, days: number): string => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};
