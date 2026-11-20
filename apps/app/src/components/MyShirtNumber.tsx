import type { SupabaseClient } from '@supabase/supabase-js';
import { getTranslations } from 'next-intl/server';
import { requestShirt, withdrawShirt } from '@/app/actions/shirts';
import { ResultBanner } from '@/components/ResultBanner';
import { ShirtGrid } from '@/components/ShirtGrid';
import { shirtNumbers, type ShirtRequest } from '@/lib/shirts';

type Team = { team_season_id: string; jersey_number: number | null; team_seasons: { teams: { name: string } } };

/**
 * My profile → Shirt number (migration 0057): for each of the player's teams this season, the number they wear, their
 * open request (withdraw) or the last decision, and the free numbers to ask for. The coach or an admin decides.
 */
export async function MyShirtNumber({ db, playerId, result, back = '/me/profile' }: { db: SupabaseClient; playerId: string; result?: unknown; back?: '/me/profile' | '/account' }) {
  const t = await getTranslations('shirt');
  const { data } = await db.from('team_players').select('team_season_id, jersey_number, team_seasons!inner(teams!inner(name), seasons!inner(is_current))')
    .eq('player_id', playerId).is('left_on', null).eq('team_seasons.seasons.is_current', true);
  const teams = (data ?? []) as unknown as Team[];
  if (!teams.length) return null;
  const { data: reqRows } = await db.from('jersey_requests').select('id, team_season_id, player_id, number, note, status, decision_note, created_at, decided_at')
    .eq('player_id', playerId).in('team_season_id', teams.map((x) => x.team_season_id)).order('created_at', { ascending: false });
  const reqs = (reqRows ?? []) as ShirtRequest[];
  const grids = await Promise.all(teams.map((x) => shirtNumbers(db, x.team_season_id)));
  const labels = {
    free: t('free'), taken: (name: string) => t('takenBy', { name }), yours: t('yours'), requested: (n: number) => t('requestedN', { count: n }),
    legendFree: t('legendFree'), legendTaken: t('legendTaken'), legendRequested: t('legendRequested'),
  };
  return (
    <section id="shirts" className="scroll-mt-4 rounded-card border border-line bg-raised p-6" aria-labelledby="shirt-h" data-my-shirt>
      <h2 id="shirt-h" className="font-display text-xl font-extrabold">{t('myTitle')}</h2>
      <p className="mt-1 text-sm text-muted">{t('myLead')}</p>
      <div className="mt-3"><ResultBanner ns="shirt" result={result} /></div>
      {teams.map((team, i) => {
        const open = reqs.find((r) => r.team_season_id === team.team_season_id && r.status === 'pending');
        const last = reqs.find((r) => r.team_season_id === team.team_season_id && (r.status === 'approved' || r.status === 'declined'));
        const free = grids[i]!.filter((n) => n.free).length;
        return (
          <div key={team.team_season_id} className="mt-4 grid gap-3 border-t border-line pt-4 first-of-type:border-0" data-shirt-team={team.team_seasons.teams.name}>
            <div className="flex flex-wrap items-center gap-3">
              <span className={`flex size-14 items-center justify-center rounded-control font-display text-2xl font-black tabular-nums ${team.jersey_number ? 'bg-accent text-on-accent' : 'border-2 border-dashed border-line text-muted'}`} data-my-number>{team.jersey_number ?? '–'}</span>
              <div>
                <p className="font-semibold"><bdi>{team.team_seasons.teams.name}</bdi></p>
                <p className="text-sm text-muted">{team.jersey_number ? t('youWear', { number: team.jersey_number }) : t('noNumber')} · {t('freeCount', { count: free })}</p>
              </div>
            </div>
            {open ? (
              <form action={withdrawShirt} className="flex flex-wrap items-center gap-3 rounded-card bg-gold/90 p-3 text-sm text-black" data-open-request>
                <input type="hidden" name="request_id" value={open.id} /><input type="hidden" name="back" value={back} />
                <span className="font-semibold">{t('waiting', { number: open.number })}</span>
                <button className="min-h-9 rounded-full border-2 border-black px-3 font-bold hover:bg-black/10" data-withdraw>{t('withdraw')}</button>
              </form>
            ) : last && (!team.jersey_number || last.status === 'declined') && last.decided_at && Date.now() - Date.parse(last.decided_at) < 30 * 864e5 ? (
              <p className={`rounded-card p-3 text-sm font-semibold ${last.status === 'approved' ? 'bg-accent/15 text-pitch' : 'bg-danger/10 text-danger'}`} data-last-decision={last.status}>
                {last.status === 'approved' ? t('wasApproved', { number: last.number }) : t('wasDeclined', { number: last.number })}{last.status === 'declined' && !last.decision_note && grids[i]!.find((n) => n.number === last.number)?.free === false ? ` ${t('givenOther')}` : ''}{last.decision_note ? <> · <bdi>{last.decision_note}</bdi></> : null}
              </p>
            ) : null}
            <details open={!team.jersey_number && !open ? true : undefined} className="rounded-card bg-surface p-3">
              <summary className="cursor-pointer font-semibold">{open ? t('changeRequest') : team.jersey_number ? t('askOther') : t('askTitle')}</summary>
              <form action={requestShirt} className="mt-3 grid gap-3" data-shirt-form>
                <input type="hidden" name="team_season_id" value={team.team_season_id} /><input type="hidden" name="back" value={back} />
                <fieldset><legend className="mb-2 text-sm font-semibold">{t('pick')}</legend>
                  <ShirtGrid numbers={grids[i]!} pick="number" mine={team.jersey_number} labels={labels} /></fieldset>
                <label className="grid gap-1 text-sm font-semibold">{t('note')}
                  <input name="note" maxLength={200} placeholder={t('noteEg')} className="min-h-10 rounded-control border border-line bg-raised px-3 font-normal" /></label>
                <button className="min-h-11 justify-self-start rounded-full bg-accent px-6 font-display font-bold text-on-accent hover:brightness-110" data-shirt-request-btn>{t('send')}</button>
                <p className="text-xs text-muted">{t('sendHint')}</p>
              </form>
            </details>
          </div>
        );
      })}
    </section>
  );
}
