import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { LOCALE_LABELS, TIME_ZONE, isLocale } from '@afrofoot/i18n';
import { EventForm, EventList, type EventRow } from '@/components/events/EventParts';
import { PinIcon } from '@/components/events/LocationPicker';
import { ResultBanner } from '@/components/ResultBanner';
import { requireArea } from '@/lib/auth';
import { mapsLinkFor } from '@/lib/locations';
import { getSupabase } from '@/lib/supabase/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('events'))('adminTitle') };
}

/**
 * Admin → Events (migration 0034): club-wide and team events, from yesterday on, with cancel / restore, and the saved
 * places with their Google Maps links. Training and matches stay with the coaches (team pages).
 */
export default async function AdminEventsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireArea('admin');
  const [sp, t, rawLocale, supabase] = await Promise.all([searchParams, getTranslations('events'), getLocale(), getSupabase()]);
  const tag = isLocale(rawLocale) ? LOCALE_LABELS[rawLocale].intl : 'en-GB';
  const when = new Intl.DateTimeFormat(tag, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TIME_ZONE });
  const hm = new Intl.DateTimeFormat(tag, { hour: '2-digit', minute: '2-digit', timeZone: TIME_ZONE });
  const [{ data: events }, { data: teamRows }, { data: places }] = supabase ? await Promise.all([
    supabase.from('club_events').select('id, kind, title, starts_at, ends_at, meet_at, meeting_point, status, public, team_season_id, description, locations(name, address, city, maps_url)')
      .gte('ends_at', new Date(Date.now() - 86400000).toISOString()).order('starts_at').limit(60),
    supabase.from('team_seasons').select('id, teams!inner(name), seasons!inner(is_current)').eq('seasons.is_current', true),
    supabase.from('locations').select('id, name, address, city, maps_url').eq('active', true).order('name'),
  ]) : [{ data: [] }, { data: [] }, { data: [] }];
  const teams = ((teamRows ?? []) as unknown as { id: string; teams: { name: string } }[]).map((x) => ({ id: x.id, name: x.teams.name }));
  const teamName = new Map(teams.map((x) => [x.id, x.name]));
  const back = '/admin/events';

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <header>
        <h1 className="font-display text-2xl font-extrabold">{t('adminTitle')}</h1>
        <p className="mt-1 text-muted">{t('adminLead')}</p>
      </header>
      <ResultBanner ns="events" result={sp.result} />
      <section id="events" className="rounded-card border border-line bg-raised p-6" aria-labelledby="ev-h">
        <h2 id="ev-h" className="font-display text-xl font-extrabold">{t('upcoming')}</h2>
        <EventList events={(events ?? []) as unknown as EventRow[]} back={back} canChange={() => true} fmt={{ when, hm }} teamName={(id) => (id ? teamName.get(id) ?? null : null)} />
        <details className="mt-4 rounded-card bg-surface p-4" open={(events ?? []).length === 0}>
          <summary className="cursor-pointer font-semibold">{t('addEvent')}</summary>
          <EventForm back={back} places={(places ?? []).map((p) => ({ id: p.id, name: p.name, city: p.city }))} teams={teams} />
        </details>
      </section>
      <section className="rounded-card border border-line bg-raised p-6" aria-labelledby="pl-h">
        <h2 id="pl-h" className="font-display text-xl font-extrabold">{t('placesTitle')}</h2>
        <p className="mt-1 text-sm text-muted">{t('placesLead')}</p>
        {(places ?? []).length === 0 ? <p className="mt-2 text-muted">{t('noPlaces')}</p> : (
          <ul className="mt-2 divide-y divide-line" data-places>
            {(places ?? []).map((p) => { const link = mapsLinkFor(p); return (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span><bdi className="font-semibold">{p.name}</bdi>{p.address || p.city ? <span className="text-muted"> · {[p.address, p.city].filter(Boolean).join(', ')}</span> : null}</span>
                {link ? <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-pitch underline underline-offset-2"><PinIcon />{t('openMaps')}</a> : null}
              </li>); })}
          </ul>
        )}
      </section>
    </div>
  );
}
