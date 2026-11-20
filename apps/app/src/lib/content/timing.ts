import { helsinkiToIso, helsinkiToday, addDays } from '@/lib/time';

/**
 * When to post on social media (the club's "best time" rule, migration 0064 setting content.post_time = "best"):
 * a match report soon after the game (not after 21:00, else the next day at 12:00); a preview the evening before the game
 * (18:00; if that has passed, in an hour); everything else the next day at 18:00 (12:00 at weekends). With a fixed time
 * ("18:00") the next such time. The approver can always change it.
 */
export function suggestPostTime(kind: string, facts: Record<string, unknown>, setting: string, now = new Date()): string {
  const today = helsinkiToday(now);
  const at = (day: string, hm: string) => helsinkiToIso(day, hm);
  const soon = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(setting)) {
    const t = at(today, setting);
    return t > now.toISOString() ? t : at(addDays(today, 1), setting);
  }
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'Europe/Helsinki' }).format(now));
  if (kind === 'match_report') return hour < 21 ? soon : at(addDays(today, 1), '12:00');
  if (kind === 'match_preview' && typeof facts.kickoff === 'string') {
    const eve = at(addDays(facts.kickoff.slice(0, 10), -1), '18:00');
    return eve > now.toISOString() ? eve : soon;
  }
  const next = addDays(today, 1);
  const wd = new Date(`${next}T12:00:00Z`).getUTCDay();
  return at(next, wd === 0 || wd === 6 ? '12:00' : '18:00');
}
