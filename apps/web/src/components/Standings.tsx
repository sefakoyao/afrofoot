import type { ReactNode } from 'react';
import type { getTranslations } from 'next-intl/server';
import { Card, H2, Section } from '@/components/Page';
import { Link } from '@/i18n/routing';
import type { League } from '@/lib/league';

/** A results line: a link to the game's page when there is one (Palloliitto games), else plain. */
function Row({ href, children }: { href?: string; children: React.ReactNode }) {
  const cls = 'flex items-center gap-3 py-3';
  return href ? <Link href={href} className={`${cls} -mx-2 rounded-control px-2 hover:bg-surface`} data-game-link>{children}</Link> : <div className={cls}>{children}</div>;
}

/** Card header of the standings: black, with the green-to-yellow band of the logo's top edge. */
export function Banner({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="relative bg-fg px-5 pb-4 pt-6 text-white">
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1.5 bg-logo-band rtl:-scale-x-100" />
      <h3 className="font-display text-xl font-extrabold leading-tight">{title}</h3>
      {sub ? <p className="mt-0.5 text-sm text-white/70">{sub}</p> : null}
    </div>
  );
}

/**
 * The standings section (home page and Team page): latest results and the league table (Palloliitto's when synced, with
 * "final table" once the season is over), else the member app's records. "top" goes above the latest results (the Team
 * page puts the all-time top scorers there).
 */
export function Standings({ league, t, day, short, top }: {
  league: League; t: Awaited<ReturnType<typeof getTranslations<'site'>>>; day: Intl.DateTimeFormat; short: Intl.DateTimeFormat; top?: ReactNode;
}) {
  const { results, table, tableInfo, clubRow, tableFinal, syncedAt, records } = league;
  return (
    <>
      {table.length || records.length || results.length || top ? (
        <Section id="standings">
          <H2>{t('stand')}</H2>
          {table.length ? (
            <p className="mb-4 mt-1 text-sm text-muted" data-standings-source>{syncedAt ? t('sync_fed', { date: day.format(new Date(syncedAt)) }) : t('sync_fed_plain')}</p>
          ) : <div className="mb-4" />}
          <div className="grid items-start gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
            {top || results.length ? (
            <div className="grid gap-5">
            {top}
            {results.length ? (
              <Card className="overflow-hidden !p-0">
                <Banner title={t('res_h')} />
                <ul className="divide-y divide-line px-5 py-1" data-results>
                  {results.map((m) => {
                    const o = m.outcome;
                    return (
                      <li key={m.id} data-outcome={o ?? undefined}>
                        <Row href={m.href}>
                        {o ? (
                          <span title={t(o === 'w' ? 'res_win' : o === 'd' ? 'res_draw' : 'res_loss')}
                            className={`grid size-9 shrink-0 place-items-center rounded-full font-display text-sm font-black ${o === 'w' ? 'bg-accent text-on-accent' : o === 'd' ? 'bg-gold text-fg' : 'bg-fg text-white'}`}>
                            <span aria-hidden="true">{t(o === 'w' ? 'res_w' : o === 'd' ? 'res_d' : 'res_l')}</span>
                            <span className="sr-only">{t(o === 'w' ? 'res_win' : o === 'd' ? 'res_draw' : 'res_loss')}</span>
                          </span>
                        ) : <span className="size-9 shrink-0" />}
                        <span className="grid min-w-0 flex-1">
                          <span className="text-xs text-muted">{short.format(new Date(m.kickoff_at))} · {m.tag}</span>
                          <span className="truncate" dir="ltr">
                            <bdi className={m.clubHome ? 'font-extrabold' : 'font-medium'}>{m.home}</bdi>
                            <span className="mx-1.5 text-muted">–</span>
                            <bdi className={m.clubHome ? 'font-medium' : 'font-extrabold'}>{m.away}</bdi>
                          </span>
                        </span>
                        <span dir="ltr" className="shrink-0 rounded-full bg-fg px-3 py-1 font-display font-black tabular-nums text-white">{m.score}</span>
                        {m.href ? <span aria-hidden="true" className="shrink-0 text-muted rtl:-scale-x-100">›</span> : null}
                        </Row>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            ) : null}
            </div>
            ) : null}
            {table.length && tableInfo ? (
              <Card className="overflow-hidden !p-0" data-league-table>
                <Banner
                  title={`${tableInfo.category ?? tableInfo.competition}${tableInfo.group_name ? ` · ${t('st_group', { group: tableInfo.group_name })}` : ''}`}
                  sub={`${tableInfo.season ? t('st_season', { season: tableInfo.season }) : tableInfo.competition}${tableFinal ? ` · ${t('st_final')}` : ''}`} />
                {clubRow ? (
                  <p className="bg-gold px-5 py-2 font-display text-sm font-extrabold text-fg" data-club-summary>
                    {t('st_you', { pos: clubRow.position, n: table.length, pts: clubRow.points })}
                  </p>
                ) : null}
                <div className="overflow-x-auto px-3 pb-3 pt-2 sm:px-4">
                  <table className="w-full text-start text-sm tabular-nums">
                    <thead><tr className="text-xs font-bold uppercase tracking-wide text-muted">
                      <th className="px-1.5 py-2 text-start">#</th><th className="px-1.5 py-2 text-start">{t('th_team')}</th>
                      {(['th_p', 'th_w', 'th_d', 'th_l'] as const).map((k) => <th key={k} className="px-1.5 py-2 text-end">{t(k)}</th>)}
                      <th className="hidden px-1.5 py-2 text-end sm:table-cell">{t('th_goals')}</th><th className="px-1.5 py-2 text-end">{t('th_pts')}</th>
                    </tr></thead>
                    <tbody>
                      {table.map((r) => (
                        <tr key={r.team_name} className={r.is_club ? 'bg-gold/45 font-bold' : 'border-t border-line'} data-club-row={r.is_club || undefined}>
                          <td className={`px-1.5 py-2 ${r.is_club ? 'rounded-s-xl' : ''}`}>
                            <span className={`inline-grid size-7 place-items-center rounded-full text-xs font-black ${r.is_club ? 'bg-fg text-gold' : r.position === 1 ? 'bg-accent text-on-accent' : 'bg-surface'}`}>{r.position}</span>
                          </td>
                          <td className="px-1.5 py-2"><bdi className={r.is_club ? 'font-black' : 'font-semibold'}>{r.team_name}</bdi></td>
                          <td className="px-1.5 py-2 text-end">{r.played}</td><td className="px-1.5 py-2 text-end">{r.won}</td><td className="px-1.5 py-2 text-end">{r.drawn}</td><td className="px-1.5 py-2 text-end">{r.lost}</td>
                          <td className="hidden px-1.5 py-2 text-end sm:table-cell" dir="ltr">{r.goals_for}–{r.goals_against}</td>
                          <td className={`px-1.5 py-2 text-end text-base font-black ${r.is_club ? 'rounded-e-xl' : ''}`}>{r.points}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            ) : records.length ? (
              <Card className="overflow-hidden !p-0">
                <Banner title={t('stand')} />
                <div className="overflow-x-auto px-3 pb-3 pt-2 sm:px-4">
                  <table className="w-full text-start text-sm tabular-nums">
                    <thead><tr className="text-xs font-bold uppercase tracking-wide text-muted">
                      <th className="px-1.5 py-2 text-start">#</th><th className="px-1.5 py-2 text-start">{t('th_team')}</th>
                      {(['th_p', 'th_w', 'th_d', 'th_l', 'th_pts'] as const).map((k) => <th key={k} className="px-1.5 py-2 text-end">{t(k)}</th>)}
                    </tr></thead>
                    <tbody>
                      {records.map((r, i) => (
                        <tr key={r.team_season_id} className="border-t border-line">
                          <td className="px-1.5 py-2"><span className="inline-grid size-7 place-items-center rounded-full bg-surface text-xs font-black">{i + 1}</span></td><td className="px-1.5 py-2 font-bold">{r.team_name}</td>
                          <td className="px-1.5 py-2 text-end">{r.played}</td><td className="px-1.5 py-2 text-end">{r.won}</td><td className="px-1.5 py-2 text-end">{r.drawn}</td><td className="px-1.5 py-2 text-end">{r.lost}</td>
                          <td className="px-1.5 py-2 text-end text-base font-black">{r.points}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            ) : null}
          </div>
        </Section>
      ) : null}
    </>
  );
}
