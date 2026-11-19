import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { LOCALE_LABELS, TIME_ZONE, isLocale } from '@afrofoot/i18n';
import { EventForm, EventList, type EventRow } from '@/components/events/EventParts';
import { PinIcon } from '@/components/events/LocationPicker';
import { Replies } from '@/components/events/Replies';
import { ResultBanner } from '@/components/ResultBanner';
import { requireArea } from '@/lib/auth';
import { mapsLinkFor } from '@/lib/locations';
import { loadOpponents } from '@/lib/opponents';
import { getSupabase } from '@/lib/supabase/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('events'))('adminTitle') };
}

/**
 * Admin → Events (migration 0034): club-wide and team events, from yesterday on, with cancel / restore, and the saved
 * places with their Google Maps links. Admins can also add a training or game for a team (saved like the coaches' own);
 * the next trainings and games of all teams are listed, while attendance and line-ups stay on the coaches' team pages.
 */
export default async function AdminEventsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireArea('admin');
  const [sp, t, tm, tc, rawLocale, supabase] = await Promise.all([searchParams, getTranslations('events'), getTranslations('match'), getTranslations('coach'), getLocale(), getSupabase()]);
  const tag = isLocale(rawLocale) ? LOCALE_LABELS[rawLocale].intl : 'en-GB';
  const when = new Intl.DateTimeFormat(tag, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TIME_ZONE });
  const hm = new Intl.DateTimeFormat(tag, { hour: '2-digit', minute: '2-digit', timeZone: TIME_ZONE });
  const nowIso = new Date().toISOString();
  const [{ data: events }, { data: teamRows }, { data: places }, { data: sessions }, { data: games }] = supabase ? await Promise.all([
    supabase.from('club_events').select('id, kind, title, starts_at, ends_at, meet_at, meeting_point, status, public, team_season_id, description, locations(name, address, city, maps_url)')
      .gte('ends_at', new Date(Date.now() - 86400000).toISOString()).order('starts_at').limit(60),
    supabase.from('team_seasons').select('id, teams!inner(name), seasons!inner(is_current)').eq('seasons.is_current', true),
    supabase.from('locations').select('id, name, address, city, maps_url').eq('active', true).order('name'),
    supabase.from('training_sessions').select('id, title, starts_at, status, team_season_id, locations(name)').gte('starts_at', nowIso).order('starts_at').limit(30),
    supabase.from('matches').select('id, opponent, event_type, division, home_away, kickoff_at, status, team_season_id, locations(name)').gte('kickoff_at', nowIso).order('kickoff_at').limit(30),
  ]) : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }];
  type Sport = { id: string; kind: 'training' | 'game' | 'friendly'; title: string; at: string; status: string; team: string | null; place: string | null; extra: string | null };
  const sport: Sport[] = [
    ...((sessions ?? []) as unknown as { id: string; title: string; starts_at: string; status: string; team_season_id: string; locations: { name: string } | null }[])
      .map((x) => ({ id: x.id, kind: 'training' as const, title: x.title, at: x.starts_at, status: x.status, team: x.team_season_id, place: x.locations?.name ?? null, extra: null })),
    ...((games ?? []) as unknown as { id: string; opponent: string; event_type: 'game' | 'friendly'; division: string | null; home_away: string; kickoff_at: string; status: string; team_season_id: string; locations: { name: string } | null }[])
      .map((x) => ({ id: x.id, kind: x.event_type, title: x.opponent, at: x.kickoff_at, status: x.status, team: x.team_season_id, place: x.locations?.name ?? null, extra: [x.division, tm(x.home_away === 'away' ? 'away' : 'home')].filter(Boolean).join(' · ') })),
  ].sort((a, b) => a.at.localeCompare(b.at)).slice(0, 30);
  // Replies to the listed trainings and games, with names (admin_all on both tables and on players).
  const trainingIds = sport.filter((x) => x.kind === 'training').map((x) => x.id), gameIds = sport.filter((x) => x.kind !== 'training').map((x) => x.id);
  type Reply = { player_id: string; availability: string; note: string | null; session_id?: string; match_id?: string; players: { first_name: string; last_name: string } | null };
  const [{ data: sessionReplies }, { data: gameReplies }] = supabase ? await Promise.all([
    trainingIds.length ? supabase.from('session_attendance').select('session_id, player_id, availability, note, players(first_name, last_name)').in('session_id', trainingIds) : Promise.resolve({ data: [] }),
    gameIds.length ? supabase.from('match_availability').select('match_id, player_id, availability, note, players(first_name, last_name)').in('match_id', gameIds) : Promise.resolve({ data: [] }),
  ]) : [{ data: [] }, { data: [] }];
  const repliesFor = (x: { id: string; kind: string }) => ((x.kind === 'training' ? sessionReplies : gameReplies) as unknown as Reply[] | null ?? [])
    .filter((r) => (x.kind === 'training' ? r.session_id : r.match_id) === x.id)
    .map((r) => ({ player_id: r.player_id, name: r.players ? `${r.players.first_name} ${r.players.last_name}` : '–', availability: r.availability, note: r.note }));
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
          <EventForm back={back} places={(places ?? []).map((p) => ({ id: p.id, name: p.name, city: p.city }))} teams={teams} sport opponents={supabase ? await loadOpponents(supabase) : []} />
        </details>
      </section>
      <section className="rounded-card border border-line bg-raised p-6" aria-labelledby="sp-h" data-sport-list>
        <h2 id="sp-h" className="font-display text-xl font-extrabold">{t('sportTitle')}</h2>
        <p className="mt-1 text-sm text-muted">{t('sportLead')}</p>
        {sport.length === 0 ? <p className="mt-2 text-muted">{t('noSport')}</p> : (
          <ul className="mt-2 divide-y divide-line">
            {sport.map((x) => (
              <li key={x.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2" data-sport-item={x.kind}>
                <span>
                  <span className="me-2 rounded-full bg-accent/15 px-2 py-0.5 text-xs font-bold text-pitch">{t(`kind_${x.kind}`)}</span>
                  <bdi className={`font-semibold ${x.status === 'cancelled' ? 'line-through' : ''}`}>{x.kind === 'training' ? x.title : tc('vsOpponent', { opponent: x.title })}</bdi>
                  {x.extra ? <span className="text-sm text-muted"> · {x.extra}</span> : null}
                </span>
                <span className="text-sm text-muted">{when.format(new Date(x.at))}{x.team ? ` · ${teamName.get(x.team) ?? ''}` : ''}{x.place ? ` · ${x.place}` : ''}</span>
                {x.status === 'scheduled' ? <div className="basis-full"><Replies rows={repliesFor(x)} /></div> : null}
              </li>
            ))}
          </ul>
        )}
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
