import { getTranslations } from 'next-intl/server';
import { addOpponent, renameOpponent, setOpponentActive } from '@/app/actions/opponents';
import { ResultBanner } from '@/components/ResultBanner';
import type { Scope } from '@/lib/staff';
import { getSupabase } from '@/lib/supabase/server';

const input = 'min-h-10 w-full rounded-control border border-line bg-raised px-3';
const btn = 'min-h-10 rounded-full bg-accent px-5 font-display font-bold text-on-accent hover:brightness-110';

/**
 * Teams & events → Opponents (migration 0061): the names coaches and admins pick from when booking a game or friendly.
 * Admins add, correct (rename) or hide a name; booked games keep the name they were booked with. Coaches see the
 * names in use (RLS: staff_read; only admins write).
 */
export async function OpponentsView({ sp, scope }: { sp: Record<string, string | string[] | undefined>; scope: Scope }) {
  const admin = scope.area === 'admin';
  const [t, supabase] = await Promise.all([getTranslations('opp'), getSupabase()]);
  if (!supabase) return null;
  const q = typeof sp.q === 'string' ? sp.q.trim().slice(0, 60) : '';
  const [{ data: rows }, { data: games }] = await Promise.all([
    admin ? supabase.from('opponents').select('id, name, active') : supabase.from('opponents').select('id, name, active').eq('active', true),
    supabase.from('matches').select('opponent'),
  ]);
  const played = new Map<string, number>();
  for (const g of (games ?? []) as { opponent: string }[]) { const k = g.opponent.trim().toLowerCase(); played.set(k, (played.get(k) ?? 0) + 1); }
  const all = ((rows ?? []) as { id: string; name: string; active: boolean }[])
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'fi', { sensitivity: 'base', numeric: true }));
  const list = q ? all.filter((o) => o.name.toLowerCase().includes(q.toLowerCase())) : all;
  const shown = all.filter((o) => o.active).length;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <header>
        <h1 className="font-display text-2xl font-extrabold">{t('title')}</h1>
        <p className="mt-1 max-w-3xl text-muted">{admin ? t('lead') : t('coachLead')}</p>
      </header>
      <ResultBanner ns="opp" result={sp.result} />

      {admin ? <section className="rounded-card border border-line bg-raised p-6" aria-labelledby="add-h">
        <h2 id="add-h" className="font-display text-xl font-extrabold">{t('addTitle')}</h2>
        <form action={addOpponent} className="mt-3 flex flex-wrap items-end gap-2" data-opp-add>
          <label className="grid min-w-0 flex-1 gap-1 text-sm font-semibold sm:max-w-md">{t('name')}
            <input name="name" required maxLength={120} placeholder={t('nameEg')} className={`${input} font-normal`} /></label>
          <button className={btn}>{t('add')}</button>
        </form>
      </section> : null}

      <section className="rounded-card border border-line bg-raised p-6" aria-labelledby="list-h">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="list-h" className="font-display text-xl font-extrabold">{t('listTitle')}</h2>
            <p className="text-sm text-muted" data-opp-count>{admin ? t('count', { shown, hidden: all.length - shown }) : t('countCoach', { count: shown })}</p>
          </div>
          <form className="flex items-end gap-2" role="search">
            <label className="grid gap-1 text-sm font-semibold">{t('search')}
              <input name="q" type="search" defaultValue={q} maxLength={60} className={`${input} font-normal`} data-opp-search /></label>
            <button className="min-h-10 rounded-full border-2 border-fg px-4 font-bold">{t('searchBtn')}</button>
          </form>
        </div>
        {list.length === 0 ? <p className="mt-4 text-muted">{t('none')}</p> : (
          <ul className="mt-4 divide-y divide-line">
            {list.map((o) => {
              const n = played.get(o.name.toLowerCase()) ?? 0;
              if (!admin) return (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2" data-opponent={o.name} data-active={o.active}>
                  <bdi className="font-semibold">{o.name}</bdi><span className="text-xs text-muted">{n ? t('games', { count: n }) : t('noGames')}</span>
                </li>
              );
              return (
                <li key={o.id} className="flex flex-wrap items-center justify-end gap-2 py-2 sm:justify-start" data-opponent={o.name} data-active={o.active}>
                  <form action={renameOpponent} className="flex min-w-0 basis-full items-center gap-2 sm:flex-1 sm:basis-auto">
                    <input type="hidden" name="id" value={o.id} />
                    <label className="sr-only" htmlFor={`o-${o.id}`}>{t('name')}</label>
                    <input id={`o-${o.id}`} name="name" required maxLength={120} dir="auto" defaultValue={o.name} className={`${input} min-w-0 flex-1 sm:max-w-sm ${o.active ? '' : 'text-muted line-through'}`} />
                    <button className="min-h-10 rounded-full border border-line px-3 text-sm font-semibold hover:border-accent">{t('save')}</button>
                  </form>
                  <span className="text-xs text-muted">{n ? t('games', { count: n }) : t('noGames')}</span>
                  {!o.active ? <span className="rounded-full bg-line px-2 py-0.5 text-xs font-bold">{t('hiddenTag')}</span> : null}
                  <form action={setOpponentActive}>
                    <input type="hidden" name="id" value={o.id} /><input type="hidden" name="active" value={o.active ? 'false' : 'true'} />
                    <button className={o.active ? 'min-h-10 rounded-full border border-danger px-3 text-sm font-bold text-danger hover:bg-danger/10' : 'min-h-10 rounded-full border-2 border-fg px-3 text-sm font-bold'}>{o.active ? t('hide') : t('show')}</button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
