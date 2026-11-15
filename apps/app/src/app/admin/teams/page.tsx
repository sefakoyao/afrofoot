import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { createSeason, createTeam, setCurrentSeason } from '@/app/actions/teams';
import { requireArea } from '@/lib/auth';
import { dateFormats } from '@/lib/format';
import { getSupabase } from '@/lib/supabase/server';
import { ResultBanner } from '@/components/ResultBanner';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('teams'))('title') };
}

const CATEGORIES = ['senior', 'women', 'junior', 'veterans', 'other'] as const;
const input = 'min-h-10 w-full rounded-control border border-line bg-raised px-3';
type Search = Record<string, string | string[] | undefined>;

/** Seasons and the teams entered in the selected season (default: the current one), with player and coach counts. */
export default async function TeamsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireArea('admin');
  const sp = await searchParams;
  const [t, fmt, supabase] = await Promise.all([getTranslations('teams'), dateFormats(), getSupabase()]);
  const { data: seasons } = supabase ? await supabase.from('seasons').select('id, name, starts_on, ends_on, is_current').order('starts_on', { ascending: false }) : { data: [] };
  const list = seasons ?? [];
  const wanted = typeof sp.season === 'string' ? sp.season : '';
  const season = list.find((s) => s.id === wanted) ?? list.find((s) => s.is_current) ?? list[0];

  const { data: teamRows } = supabase && season
    ? await supabase.from('team_seasons').select('id, division, teams!inner(name, category), team_players(id, left_on), team_staff(id)').eq('season_id', season.id).order('created_at')
    : { data: [] };
  type Row = { id: string; division: string | null; teams: { name: string; category: string }; team_players: { id: string; left_on: string | null }[]; team_staff: { id: string }[] };
  const rows = (teamRows as unknown as Row[] | null) ?? [];
  const back = `/admin/teams${season ? `?season=${season.id}` : ''}`;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <header>
        <h1 className="font-display text-2xl font-extrabold">{t('title')}</h1>
        <p className="mt-1 text-muted">{t('lead')}</p>
      </header>
      <ResultBanner ns="teams" result={sp.result} />

      {list.length ? (
        <nav aria-label={t('seasons')} className="flex flex-wrap gap-2">
          {list.map((s) => (
            <Link key={s.id} href={`/admin/teams?season=${s.id}`} aria-current={s.id === season?.id ? 'page' : undefined}
              className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${s.id === season?.id ? 'border-accent bg-accent text-on-accent' : 'border-line bg-raised hover:border-accent'}`}>
              {s.name}{s.is_current ? ` · ${t('current')}` : ''}
            </Link>
          ))}
        </nav>
      ) : <p className="rounded-card border border-line bg-raised p-6 text-muted">{t('noSeasons')}</p>}

      {season ? (
        <section className="rounded-card border border-line bg-raised p-6" aria-labelledby="teams-h">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="teams-h" className="font-display text-xl font-extrabold">{season.name}</h2>
              <p className="text-sm text-muted">{fmt.date.format(new Date(`${season.starts_on}T12:00:00Z`))} – {fmt.date.format(new Date(`${season.ends_on}T12:00:00Z`))}</p>
            </div>
            {season.is_current ? <span className="rounded-full bg-accent/20 px-3 py-1 text-sm font-bold text-pitch">{t('current')}</span> : (
              <form action={setCurrentSeason}>
                <input type="hidden" name="season_id" value={season.id} /><input type="hidden" name="back" value={back} />
                <button className="min-h-10 rounded-full border-2 border-fg px-4 font-bold hover:bg-fg hover:text-raised">{t('makeCurrent')}</button>
              </form>
            )}
          </div>
          {rows.length === 0 ? <p className="mt-4 text-muted">{t('noTeams')}</p> : (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {rows.map((r) => (
                <li key={r.id} data-team={r.teams.name}>
                  <Link href={`/admin/teams/${r.id}`} className="block rounded-card border border-line p-4 hover:border-accent">
                    <p className="font-display text-lg font-extrabold">{r.teams.name}</p>
                    <p className="text-sm text-muted">{t(`cat_${r.teams.category}` as 'cat_senior')}{r.division ? ` · ${r.division}` : ''}</p>
                    <p className="mt-2 text-sm">{t('counts', { players: r.team_players.filter((x) => !x.left_on).length, coaches: r.team_staff.length })}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <details className="mt-5 rounded-card bg-surface p-4">
            <summary className="cursor-pointer font-semibold">{t('addTeam')}</summary>
            <form action={createTeam} className="mt-3 grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
              <input type="hidden" name="season_id" value={season.id} /><input type="hidden" name="back" value={back} />
              <label className="grid gap-1 text-sm font-semibold">{t('teamName')}<input name="name" required minLength={2} maxLength={80} placeholder="Afro Foot A" className={input} /></label>
              <label className="grid gap-1 text-sm font-semibold">{t('category')}
                <select name="category" defaultValue="senior" className={input}>{CATEGORIES.map((c) => <option key={c} value={c}>{t(`cat_${c}`)}</option>)}</select></label>
              <label className="grid gap-1 text-sm font-semibold">{t('division')}<input name="division" maxLength={80} placeholder={t('divisionEg')} className={input} /></label>
              <button className="min-h-10 rounded-full bg-accent px-5 font-bold text-on-accent hover:brightness-110">{t('add')}</button>
            </form>
            <p className="mt-2 text-xs text-muted">{t('addTeamNote')}</p>
          </details>
        </section>
      ) : null}

      <details className="rounded-card border border-line bg-raised p-6" open={list.length === 0}>
        <summary className="cursor-pointer font-display text-lg font-extrabold">{t('addSeason')}</summary>
        <form action={createSeason} className="mt-4 grid gap-3 sm:grid-cols-[2fr_1fr_1fr] sm:items-end">
          <input type="hidden" name="back" value="/admin/teams" />
          <label className="grid gap-1 text-sm font-semibold">{t('seasonName')}<input name="name" required minLength={2} maxLength={60} placeholder="2027" className={input} /></label>
          <label className="grid gap-1 text-sm font-semibold">{t('startsOn')}<input name="starts_on" type="date" required className={input} /></label>
          <label className="grid gap-1 text-sm font-semibold">{t('endsOn')}<input name="ends_on" type="date" required className={input} /></label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="current" className="size-4 accent-[rgb(var(--accent))]" defaultChecked={list.length === 0} />{t('makeCurrentNow')}</label>
          <button className="min-h-10 rounded-full bg-accent px-5 font-bold text-on-accent hover:brightness-110">{t('add')}</button>
        </form>
      </details>
    </div>
  );
}
