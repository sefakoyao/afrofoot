import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireArea } from '@/lib/auth';
import { dateFormats } from '@/lib/format';
import { loadPlayerSport, loadSeasonStats, loadTraining, type SeasonStats, type Training } from '@/lib/player';
import { getSupabase } from '@/lib/supabase/server';
import { relationLabel } from '@/lib/relations';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('me'))('tabSeason') };
}

/** My season tab: match stats, training attendance and the player profile (migration 0008 RLS: own rows and own team). */
export default async function SeasonTab() {
  const member = await requireArea('me');
  const [t, tp, tpos, trel, fmt, supabase] = await Promise.all([getTranslations('me'), getTranslations('pp'), getTranslations('position'), getTranslations('relation'), dateFormats(), getSupabase()]);
  const sport = supabase ? await loadPlayerSport(supabase, member.id) : null;
  const [stats, training]: [SeasonStats | null, Training | null] = supabase && sport
    ? await Promise.all([loadSeasonStats(supabase, sport.id), loadTraining(supabase, sport.id)]) : [null, null];

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      {stats ? (
        <section className="rounded-card border border-line bg-raised p-6" aria-labelledby="season-h">
          <h2 id="season-h" className="font-display text-xl font-extrabold">{t('seasonTitle')}</h2>
          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {([['played', stats.played], ['goals', stats.goals], ['assists', stats.assists], ['minutes', stats.minutes]] as const).map(([k, v]) => (
              <div key={k} className="rounded-card bg-surface p-4" data-stat={k}><dt className="text-sm text-muted">{t(`st_${k}`)}</dt><dd className="font-display text-3xl font-black">{v}</dd></div>
            ))}
          </dl>
          <p className="mt-3 text-sm text-muted" data-stat="discipline">
            {t('cards', { yellow: stats.yellow, red: stats.red })}{sport?.position === 'goalkeeper' ? ` · ${t('cleanSheets', { count: stats.cleanSheets })}` : ''}
          </p>
          <h3 className="mt-5 text-xs font-bold uppercase tracking-widest text-muted">{t('lastMatches')}</h3>
          {stats.last.length === 0 ? <p className="mt-2 text-muted">{t('noMatches')}</p> : (
            <ul className="mt-2 divide-y divide-line">
              {stats.last.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2" data-match={m.opponent}>
                  <span><span className="text-muted">{fmt.date.format(new Date(m.kickoffAt))}</span> · <bdi className="font-semibold">{m.opponent}</bdi>
                    {' '}<span className="text-muted">({t(m.homeAway === 'away' ? 'away' : 'home')})</span></span>
                  <span className="flex items-center gap-3 text-sm">
                    {m.goalsFor !== null && m.goalsAgainst !== null ? <span dir="ltr" className={`rounded-full px-2 font-bold ${m.goalsFor > m.goalsAgainst ? 'bg-accent/20 text-pitch' : m.goalsFor < m.goalsAgainst ? 'bg-danger/10 text-danger' : 'bg-line'}`}>{m.goalsFor}–{m.goalsAgainst}</span> : null}
                    <span>{t('lineStats', { minutes: m.minutes, goals: m.goals, assists: m.assists })}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {training ? (
        <section className="rounded-card border border-line bg-raised p-6" aria-labelledby="training-h">
          <h2 id="training-h" className="font-display text-xl font-extrabold">{t('trainingTitle')}</h2>
          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-card bg-accent/10 p-4" data-training="attended"><dt className="text-sm text-muted">{t('tr_attended')}</dt><dd className="font-display text-3xl font-black">{training.attended}</dd></div>
            <div className={`rounded-card p-4 ${training.missed ? 'bg-danger/10' : 'bg-surface'}`} data-training="missed"><dt className="text-sm text-muted">{t('tr_missed')}</dt><dd className="font-display text-3xl font-black">{training.missed}</dd></div>
            <div className="rounded-card bg-surface p-4" data-training="excused"><dt className="text-sm text-muted">{t('tr_excused')}</dt><dd className="font-display text-3xl font-black">{training.excused}</dd></div>
            <div className="rounded-card bg-surface p-4" data-training="rate"><dt className="text-sm text-muted">{t('tr_rate')}</dt><dd className="font-display text-3xl font-black">{training.rate === null ? '–' : `${training.rate}%`}</dd></div>
          </dl>
          {training.late ? <p className="mt-3 text-sm text-muted">{t('tr_late', { count: training.late })}</p> : null}
          {training.rate === null ? <p className="mt-3 text-muted">{t('tr_none')}</p> : null}
        </section>
      ) : null}

      {sport ? (
        <section className="rounded-card border border-line bg-raised p-6" aria-labelledby="pp-h">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="pp-h" className="font-display text-xl font-extrabold">{tp('title')}</h2>
            <Link href="/me/profile" className="inline-flex min-h-10 items-center rounded-full border-2 border-fg px-4 font-bold hover:bg-fg hover:text-raised">{tp('edit')}</Link>
          </div>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-muted">{tp('position')}</dt><dd className="font-semibold">{sport.position ? tpos(sport.position) : '–'}</dd></div>
            <div><dt className="text-muted">{tp('foot')}</dt><dd className="font-semibold">{sport.preferredFoot ? tp(`foot_${sport.preferredFoot}`) : '–'}</dd></div>
            <div><dt className="text-muted">{tp('phone')}</dt><dd className="font-semibold">{sport.phone ? <bdi dir="ltr">{sport.phone}</bdi> : <span className="text-danger">{tp('missing')}</span>}</dd></div>
            <div><dt className="text-muted">{tp('emergencyTitle')}</dt><dd className="font-semibold">{sport.emergencyName
              ? <><bdi>{sport.emergencyName}</bdi>{sport.emergencyRelation ? <> ({relationLabel(trel, sport.emergencyRelation)})</> : null}{sport.emergencyPhone ? <> · <bdi dir="ltr">{sport.emergencyPhone}</bdi></> : null}</>
              : <span className="text-danger">{tp('missing')}</span>}</dd></div>
          </dl>
        </section>
      ) : null}
    </div>
  );
}
