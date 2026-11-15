import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LOCALE_LABELS, type Locale } from '@afrofoot/i18n';
import { ClubCalendar, type CalItem } from '@/components/ClubCalendar';
import { Hero, Section } from '@/components/Page';
import { getPublicClient } from '@/lib/supabase';

// Rebuilt at most once a minute: training, games and events created in the member app appear here without a deploy.
export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: (await getTranslations({ locale, namespace: 'site' }))('cal_h') };
}

type Row = { id: string; event_type: 'game' | 'friendly' | 'practice' | 'event'; kind: string | null; team_name: string | null; title: string; home_away: string | null; division: string | null;
  starts_at: string; ends_at: string; status: string; goals_for: number | null; goals_against: number | null; venue: string | null; venue_address: string | null; city: string | null; maps_url: string | null; description: string | null };

const mapsFor = (r: Row) => (r.maps_url && /^https:\/\//.test(r.maps_url) ? r.maps_url
  : r.venue ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([r.venue, r.venue_address, r.city].filter(Boolean).join(', '))}` : null);

/** Club calendar (view public_schedule, migration 0034): public teams' games, training and events, from today on. */
export default async function CalendarPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, te] = await Promise.all([getTranslations('site'), getTranslations('events')]);
  const intl = LOCALE_LABELS[(locale in LOCALE_LABELS ? locale : 'en') as Locale].intl;
  const tz = 'Europe/Helsinki';
  const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: tz });
  const dayLabel = new Intl.DateTimeFormat(intl, { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz });
  const hm = new Intl.DateTimeFormat(intl, { hour: '2-digit', minute: '2-digit', timeZone: tz });
  const db = getPublicClient();
  const since = new Date(); since.setHours(since.getHours() - 3);
  const { data } = db ? await db.from('public_schedule').select('*').gte('ends_at', since.toISOString()).order('starts_at').limit(200) : { data: [] };
  const items: CalItem[] = ((data ?? []) as Row[]).map((r) => {
    const group = r.event_type === 'friendly' ? 'game' : r.event_type;
    const multiDay = dayKey.format(new Date(r.starts_at)) !== dayKey.format(new Date(r.ends_at));
    const status = r.status === 'cancelled' ? 'cancelled' : r.status === 'postponed' ? 'postponed' : 'on';
    const versus = r.home_away === 'away' ? `${r.title} – ${r.team_name}` : `${r.team_name} – ${r.title}`;
    return {
      id: r.id, group, day: dayKey.format(new Date(r.starts_at)), dayLabel: dayLabel.format(new Date(r.starts_at)),
      time: multiDay ? `${hm.format(new Date(r.starts_at))} → ${dayLabel.format(new Date(r.ends_at))}` : `${hm.format(new Date(r.starts_at))}–${hm.format(new Date(r.ends_at))}`,
      badge: r.event_type === 'event' ? te(`kind_${r.kind ?? 'other'}` as 'kind_other') : t(`ev_${r.event_type}`),
      title: r.event_type === 'game' || r.event_type === 'friendly' ? versus : r.title,
      sub: r.event_type === 'game' || r.event_type === 'friendly' ? r.division : r.team_name ?? te('wholeClub'),
      place: r.venue ? [r.venue, r.venue_address, r.city].filter(Boolean).join(', ') : null, maps: mapsFor(r),
      status, statusLabel: status === 'cancelled' ? t('cal_cancelled') : status === 'postponed' ? t('cal_postponed') : null,
      score: r.status === 'played' && r.goals_for !== null ? `${r.goals_for}–${r.goals_against ?? 0}` : null,
      description: r.event_type === 'event' ? r.description : null,
    };
  });
  return (
    <>
      <Hero title={t('cal_h')} lead={t('cal_lead')} />
      <Section>
        <ClubCalendar items={items} labels={{ all: t('cal_all'), game: t('cal_games'), practice: t('cal_training'), event: t('cal_events'), none: t('cal_none'), maps: t('route_g'), newTab: t('cal_newTab'), filter: t('cal_filter') }} />
      </Section>
    </>
  );
}
