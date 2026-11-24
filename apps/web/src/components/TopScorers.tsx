import type { getTranslations } from 'next-intl/server';
import { getPublicClient } from '@/lib/supabase';

/** A row of the website's all-time top scorers (view public_top_scorers, migration 0043). */
export type Scorer = { rank: number; display_name: string; goals: number; appearances: number; current_player: boolean; first_season: number | null; last_season: number | null; since_season: number | null };

/** Top three of all league and cup goals with the club, former players included (players hidden from the website never). */
export async function getTopScorers(): Promise<Scorer[]> {
  const db = getPublicClient();
  if (!db) return [];
  const { data } = await db.from('public_top_scorers').select('rank,display_name,goals,appearances,current_player,first_season,last_season,since_season').order('rank');
  return (data ?? []) as Scorer[];
}

/** The club's three all-time top scorers (club-green card with black text and the logo band; medals gold, white, black), above the latest results. */
export function TopScorers({ scorers, t }: { scorers: Scorer[]; t: Awaited<ReturnType<typeof getTranslations<'site'>>> }) {
  const since = scorers[0]?.since_season;
  const medal = ['bg-gold text-fg', 'bg-white text-fg', 'bg-fg text-white'];
  return (
    <aside className="relative overflow-hidden rounded-card bg-accent text-on-accent shadow-sm" aria-labelledby="ts-h" data-top-scorers>
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1.5 bg-logo-band rtl:-scale-x-100" />
      <div className="px-5 pb-2 pt-6">
        <h3 id="ts-h" className="font-display text-xl font-extrabold leading-tight">{t('ts_h')}</h3>
        {since ? <p className="mt-0.5 text-sm text-on-accent/80">{t('ts_sub', { year: since })}</p> : null}
      </div>
      <ol className="px-3 pb-4">
        {scorers.map((s, i) => (
          <li key={s.rank} className="flex items-center gap-3 rounded-2xl px-2 py-2.5" data-scorer={s.rank}>
            <span className={`grid size-10 shrink-0 place-items-center rounded-full font-display text-lg font-black ${medal[i] ?? medal[2]}`}>{s.rank}</span>
            <span className="grid min-w-0 flex-1">
              <span className="truncate font-display font-extrabold">{s.display_name}</span>
              <span className="text-xs text-on-accent/80">
                {t('ts_games', { n: s.appearances })}
                {s.first_season && s.last_season ? ` · ${s.first_season === s.last_season ? s.first_season : t('ts_years', { from: s.first_season, to: s.last_season })}` : ''}
                {s.current_player ? '' : ` · ${t('ts_former')}`}
              </span>
            </span>
            <span className="shrink-0 text-end">
              <span className="block font-display text-2xl font-black leading-none tabular-nums">{s.goals}</span>
              <span className="block text-[11px] text-on-accent/80">{t('ts_goals', { n: s.goals })}</span>
            </span>
          </li>
        ))}
      </ol>
    </aside>
  );
}

