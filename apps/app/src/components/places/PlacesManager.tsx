import { getTranslations } from 'next-intl/server';
import { deletePlace, setPlaceActive } from '@/app/actions/places';
import { ResultBanner } from '@/components/ResultBanner';
import { PinIcon } from '@/components/events/LocationPicker';
import { mapsLinkFor } from '@/lib/locations';
import { PLACE_COLUMNS, type PlaceRow } from '@/lib/places';
import { getSupabase } from '@/lib/supabase/server';
import { PlaceForm } from './PlaceForm';
import { ScrollIntoView } from './ScrollIntoView';

/**
 * The club's saved places, for coaches (/coach/places) and admins (/admin/places): add a place, edit any place.
 * Admins also see hidden places, hide / show them, and delete a place nothing uses (migration 0039).
 */
export async function PlacesManager({ area, result, focus }: { area: 'admin' | 'coach'; result: unknown; focus?: string }) {
  const [t, supabase] = await Promise.all([getTranslations('places'), getSupabase()]);
  const admin = area === 'admin';
  const { data } = supabase ? await supabase.from('locations').select(PLACE_COLUMNS).order('name') : { data: [] };
  const places = (data ?? []) as PlaceRow[];
  const ids = places.map((p) => p.id);
  // How often each place is used (all tables that point at a place). Coaches only see their own teams' rows, so admins only.
  const uses = new Map<string, number>();
  if (admin && supabase && ids.length) {
    const rows = await Promise.all(['training_sessions', 'training_schedules', 'matches', 'club_events'].map((tbl) => supabase.from(tbl).select('location_id').in('location_id', ids)));
    for (const r of rows) for (const x of (r.data ?? []) as { location_id: string }[]) uses.set(x.location_id, (uses.get(x.location_id) ?? 0) + 1);
  }
  const creators = [...new Set(places.map((p) => p.created_by).filter((x): x is string => !!x))];
  const { data: people } = admin && supabase && creators.length ? await supabase.from('profiles').select('id, first_name, last_name').in('id', creators) : { data: [] };
  const nameOf = new Map(((people ?? []) as { id: string; first_name: string | null; last_name: string | null }[]).map((p) => [p.id, [p.first_name, p.last_name].filter(Boolean).join(' ')]));
  const visible = places.filter((p) => p.active);
  const hidden = admin ? places.filter((p) => !p.active) : [];
  const btn = 'inline-flex min-h-10 items-center rounded-full border border-line bg-raised px-4 text-sm font-bold hover:border-accent';

  const Item = ({ p }: { p: PlaceRow }) => {
    const link = mapsLinkFor(p);
    const used = uses.get(p.id) ?? 0;
    return (
      <li id={`place-${p.id}`} className={`scroll-mt-24 rounded-card border bg-raised p-4 ${focus === p.id ? 'border-accent ring-2 ring-accent/40' : 'border-line'}`} data-place={p.name} data-focused={focus === p.id || undefined}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-display text-lg font-extrabold">{p.name}</p>
            <p className="text-sm text-muted">{t(`kind_${p.kind}`)}{[p.address, [p.postal_code, p.city].filter(Boolean).join(' ')].filter(Boolean).length ? ` · ${[p.address, [p.postal_code, p.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')}` : ''}</p>
            {link ? <a href={link} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-pitch underline underline-offset-2"><PinIcon />{t('findOnMaps')}<span className="sr-only"> ({t('newTab')})</span></a> : null}
            {admin ? <p className="mt-1 text-xs text-muted">{t('usedBy', { count: used })}{p.created_by && nameOf.get(p.created_by) ? ` · ${t('addedBy', { name: nameOf.get(p.created_by)! })}` : ''}</p> : null}
          </div>
          {admin ? (
            <div className="flex flex-wrap gap-2">
              <form action={setPlaceActive}><input type="hidden" name="area" value="admin" /><input type="hidden" name="id" value={p.id} /><input type="hidden" name="active" value={p.active ? 'false' : 'true'} />
                <button className={btn} data-toggle-place>{p.active ? t('hide') : t('show')}</button></form>
              {used === 0 ? (
                <details className="relative" data-delete-place>
                  <summary className={`${btn} cursor-pointer list-none text-danger`}>{t('delete')}</summary>
                  <form action={deletePlace} className="absolute end-0 z-10 mt-2 w-64 rounded-card border border-line bg-raised p-3 shadow-lg">
                    <input type="hidden" name="area" value="admin" /><input type="hidden" name="id" value={p.id} />
                    <p className="text-sm">{t('deleteConfirm', { name: p.name })}</p>
                    <button className="mt-2 inline-flex min-h-10 items-center rounded-full bg-danger px-4 text-sm font-bold text-white" data-confirm-delete>{t('delete')}</button>
                  </form>
                </details>
              ) : <span className="self-center text-xs text-muted" title={t('inUseNoDelete')}>{t('inUseNoDelete')}</span>}
            </div>
          ) : null}
        </div>
        <details className="mt-3 group" data-edit-place>
          <summary className="inline-flex min-h-10 cursor-pointer list-none items-center rounded-full border-2 border-fg px-4 text-sm font-bold">{t('edit')}</summary>
          <div className="mt-3 border-t border-line pt-3"><PlaceForm area={area} place={p} /></div>
        </details>
      </li>
    );
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <section className="rounded-card border border-line bg-raised p-6">
        <h1 className="font-display text-2xl font-extrabold">{t('title')}</h1>
        <p className="mt-1 text-muted">{t('lead')}</p>
      </section>
      <ResultBanner ns="places" result={result} />
      {focus && places.some((p) => p.id === focus) ? <ScrollIntoView id={`place-${focus}`} /> : null}
      <details className="rounded-card border-2 border-accent bg-raised p-5" data-add-place>
        <summary className="cursor-pointer list-none font-display text-lg font-extrabold">＋ {t('add')}</summary>
        <p className="mt-1 text-sm text-muted">{t('addLead')}</p>
        <div className="mt-4"><PlaceForm area={area} /></div>
      </details>
      {visible.length ? <ul className="grid gap-3" data-places>{visible.map((p) => <Item key={p.id} p={p} />)}</ul>
        : <p className="rounded-card border border-line bg-raised p-5 text-muted">{t('empty')}</p>}
      {hidden.length ? (
        <section aria-labelledby="hidden-h" className="grid gap-3" data-hidden-places>
          <div><h2 id="hidden-h" className="font-display text-lg font-extrabold">{t('hiddenTitle')}</h2><p className="text-sm text-muted">{t('hiddenLead')}</p></div>
          <ul className="grid gap-3 opacity-80">{hidden.map((p) => <Item key={p.id} p={p} />)}</ul>
        </section>
      ) : null}
    </div>
  );
}
