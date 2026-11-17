import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { linkFederationPlayer, setFederationPlayerHidden } from '@/app/actions/federation';
import { ResultBanner } from '@/components/ResultBanner';
import { requireArea } from '@/lib/auth';
import { getSupabase } from '@/lib/supabase/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('fed'))('linkTitle') };
}

type FedPlayer = { external_id: string; display_name: string; shirt_number: number | null; position: string | null; player_id: string | null; hidden: boolean; on_roster: boolean };
type AppPlayer = { id: string; first_name: string; last_name: string; website_hidden: boolean; status: string };

/** Letters only, lower case, without accents: "Jäkälä-Ahmed" and "jakala ahmed" compare equal. */
const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).sort().join(' ');

/**
 * Admin → Palloliitto players (migration 0041): link each player registered with Palloliitto to the app player.
 * A same-name app player is suggested (pre-selected) but nothing is linked until the admin saves.
 */
export default async function PalloliittoPlayersPage({ searchParams }: { searchParams: Promise<{ result?: string; player?: string }> }) {
  await requireArea('admin');
  const [sp, t, supabase] = await Promise.all([searchParams, getTranslations('fed'), getSupabase()]);
  const [{ data: fed }, { data: app }, { data: stats }] = supabase ? await Promise.all([
    supabase.from('federation_players').select('external_id, display_name, shirt_number, position, player_id, hidden, on_roster').order('on_roster', { ascending: false }).order('shirt_number', { nullsFirst: false }).order('display_name'),
    supabase.from('players').select('id, first_name, last_name, website_hidden, status').neq('status', 'alumni').order('last_name'),
    supabase.from('federation_player_stats').select('player_external_id, goals, appearances, competition_external_id'),
  ]) : [{ data: [] }, { data: [] }, { data: [] }];
  const fedPlayers = (fed ?? []) as FedPlayer[];
  const appPlayers = (app ?? []) as AppPlayer[];
  const byId = new Map(appPlayers.map((p) => [p.id, p]));
  const linkedIds = new Set(fedPlayers.map((f) => f.player_id).filter(Boolean));
  const byName = new Map(appPlayers.map((p) => [norm(`${p.first_name} ${p.last_name}`), p]));
  // latest league season per Palloliitto player: competition ids end with the season (etejp26/M4/4 → 26)
  const latest = new Map<string, { goals: number; appearances: number; key: string }>();
  for (const s of (stats ?? []) as { player_external_id: string; goals: number; appearances: number; competition_external_id: string }[]) {
    const cur = latest.get(s.player_external_id);
    if (!cur || s.competition_external_id > cur.key) latest.set(s.player_external_id, { goals: s.goals, appearances: s.appearances, key: s.competition_external_id });
  }
  const linked = fedPlayers.filter((f) => f.player_id).length;
  // shown on the website: on the current roster, not hidden by the club, and not removed by the player (view public_squad)
  const isShown = (f: FedPlayer) => f.on_roster && !f.hidden && !(f.player_id && byId.get(f.player_id)?.website_hidden);
  const shown = fedPlayers.filter(isShown).length;
  const select = 'min-h-10 w-full rounded-control border border-line bg-raised px-2 text-sm';
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <header>
        <h1 className="font-display text-2xl font-extrabold">{t('linkTitle')}</h1>
        <p className="mt-1 text-muted">{t('linkLead')}</p>
      </header>
      <ResultBanner ns="fed" result={sp.result} />
      {fedPlayers.length === 0 ? <p className="rounded-card border border-line bg-raised p-6 text-muted">{t('empty')}</p> : (
        <section className="rounded-card border border-line bg-raised p-4 sm:p-6" data-fed-players>
          <p className="mb-3 text-sm font-semibold" data-link-counts>{t('counts', { total: fedPlayers.length, linked, shown })}</p>
          <ul className="divide-y divide-line">
            {fedPlayers.map((f) => {
              const current = f.player_id ? byId.get(f.player_id) : undefined;
              const guess = !f.player_id ? byName.get(norm(f.display_name)) : undefined;
              const suggestion = guess && !linkedIds.has(guess.id) ? guess : undefined;
              const st = latest.get(f.external_id);
              return (
                <li key={f.external_id} className={`grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] sm:items-center ${sp.player === f.external_id ? 'rounded-control bg-accent/10 px-2' : ''} ${f.on_roster ? '' : 'opacity-60'}`} data-fed-player={f.display_name}>
                  <div>
                    <p className="font-semibold"><bdi>{f.display_name}</bdi>{f.shirt_number !== null ? <span className="ms-2 text-muted" dir="ltr">#{f.shirt_number}</span> : null}</p>
                    <p className="text-xs text-muted">{[f.position, st ? t('statsShort', { goals: st.goals, games: st.appearances }) : null].filter(Boolean).join(' · ')}
                      {isShown(f) ? <span className="ms-2 rounded-full bg-accent/20 px-2 py-0.5 font-bold text-pitch" data-shown>{t('onWebsite')}</span>
                        : <span className="ms-2 rounded-full bg-line px-2 py-0.5 font-bold" data-not-shown>{!f.on_roster ? t('offRoster') : f.hidden ? t('hiddenByAdmin') : t('removedSelf')}</span>}</p>
                    {f.on_roster ? (
                      <form action={setFederationPlayerHidden} className="mt-1">
                        <input type="hidden" name="external_id" value={f.external_id} /><input type="hidden" name="hidden" value={f.hidden ? 'false' : 'true'} />
                        <button className="text-xs font-semibold text-pitch underline underline-offset-2" data-hide-toggle>{f.hidden ? t('show') : t('hide')}</button>
                      </form>
                    ) : null}
                  </div>
                  <form action={linkFederationPlayer} className="flex gap-2">
                    <input type="hidden" name="external_id" value={f.external_id} />
                    <label className="sr-only" htmlFor={`link-${f.external_id}`}>{t('colApp')}</label>
                    <select id={`link-${f.external_id}`} name="player_id" defaultValue={f.player_id ?? suggestion?.id ?? ''} className={select}>
                      <option value="">{t('notLinked')}</option>
                      {appPlayers.map((p) => (
                        <option key={p.id} value={p.id} disabled={linkedIds.has(p.id) && p.id !== f.player_id}>
                          {p.first_name} {p.last_name}{suggestion?.id === p.id ? ` (${t('suggested')})` : ''}
                        </option>
                      ))}
                    </select>
                    <button className="min-h-10 shrink-0 rounded-full bg-accent px-4 text-sm font-bold text-on-accent hover:brightness-110" data-link-save>{t('save')}</button>
                  </form>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
