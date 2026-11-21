'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { savePlace } from '@/app/actions/places';
import { PinIcon } from '@/components/events/LocationPicker';

const KINDS = ['pitch', 'hall', 'gym', 'field', 'other'] as const;
const input = 'min-h-11 w-full rounded-control border border-line bg-raised px-3';
// A search link the app made from the address (lib/locations.ts googleMapsSearch) is not shown: left empty, it is made
// again from the new address on save, so it never points to an old address. A pasted share link is kept.
const AUTO_LINK = 'https://www.google.com/maps/search/?api=1&query=';
export type PlaceValues = {
  id?: string; name?: string; kind?: string; address?: string | null; postal_code?: string | null; city?: string | null; maps_url?: string | null;
  directions?: string | null; transit?: string | null; parking?: string | null; notes?: string | null;
};

/**
 * Add or edit a saved place. "Find it on Google Maps" searches for what was typed, so the coach can copy the place's share
 * link; without a link the server makes a Google Maps search link from the address (actions/places.ts).
 */
export function PlaceForm({ area, place = {} }: { area: 'admin' | 'coach'; place?: PlaceValues }) {
  const t = useTranslations('places');
  const [q, setQ] = useState({ name: place.name ?? '', address: place.address ?? '', city: place.city ?? '' });
  const query = [q.name, q.address, q.city].map((s) => s.trim()).filter(Boolean).join(', ');
  const id = place.id ?? 'new';
  return (
    <form action={savePlace} className="grid gap-3 sm:grid-cols-2" data-place-form={id}>
      <input type="hidden" name="area" value={area} />
      {place.id ? <input type="hidden" name="id" value={place.id} /> : null}
      <label className="grid gap-1 text-sm font-semibold sm:col-span-2">{t('name')}
        <input name="name" required minLength={2} maxLength={120} defaultValue={place.name ?? ''} placeholder={t('nameEg')} className={input}
          onChange={(e) => setQ({ ...q, name: e.target.value })} /></label>
      <label className="grid gap-1 text-sm font-semibold">{t('kind')}
        <select name="kind" defaultValue={place.kind ?? 'pitch'} className={input}>
          {KINDS.map((k) => <option key={k} value={k}>{t(`kind_${k}`)}</option>)}
        </select></label>
      <label className="grid gap-1 text-sm font-semibold">{t('address')}
        <input name="address" maxLength={200} autoComplete="street-address" defaultValue={place.address ?? ''} className={input}
          onChange={(e) => setQ({ ...q, address: e.target.value })} /></label>
      <label className="grid gap-1 text-sm font-semibold">{t('postal')}
        <input name="postal_code" maxLength={12} autoComplete="postal-code" inputMode="numeric" defaultValue={place.postal_code ?? ''} className={input} dir="ltr" /></label>
      <label className="grid gap-1 text-sm font-semibold">{t('city')}
        <input name="city" maxLength={80} defaultValue={place.city ?? ''} placeholder="Helsinki" className={input}
          onChange={(e) => setQ({ ...q, city: e.target.value })} /></label>
      <label className="grid gap-1 text-sm font-semibold sm:col-span-2">{t('maps')}
        <input name="maps_url" type="url" inputMode="url" maxLength={500} pattern="https://.+" defaultValue={place.maps_url?.startsWith(AUTO_LINK) ? '' : place.maps_url ?? ''} placeholder="https://maps.app.goo.gl/…" className={input} dir="ltr" />
        <span className="text-xs font-normal text-muted">{t('mapsHint')}</span></label>
      {query ? (
        <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`} target="_blank" rel="noopener noreferrer" data-find-on-maps
          className="inline-flex min-h-10 w-fit items-center gap-2 rounded-full border-2 border-fg px-4 text-sm font-bold hover:bg-fg hover:text-raised sm:col-span-2">
          <PinIcon /> {t('findOnMaps')}<span className="sr-only"> ({t('newTab')})</span>
        </a>
      ) : null}
      <label className="grid gap-1 text-sm font-semibold sm:col-span-2">{t('directions')}
        <textarea name="directions" rows={2} maxLength={1500} defaultValue={place.directions ?? ''} className={`${input} py-2`} />
        <span className="text-xs font-normal text-muted">{t('directionsHint')}</span></label>
      <label className="grid gap-1 text-sm font-semibold">{t('transit')}
        <input name="transit" maxLength={500} defaultValue={place.transit ?? ''} placeholder={t('transitEg')} className={input} /></label>
      <label className="grid gap-1 text-sm font-semibold">{t('parking')}
        <input name="parking" maxLength={500} defaultValue={place.parking ?? ''} placeholder={t('parkingEg')} className={input} /></label>
      <label className="grid gap-1 text-sm font-semibold sm:col-span-2">{t('notes')}
        <input name="notes" maxLength={500} defaultValue={place.notes ?? ''} className={input} />
        <span className="text-xs font-normal text-muted">{t('notesHint')}</span></label>
      <div className="sm:col-span-2">
        <button className="inline-flex min-h-11 items-center rounded-full bg-accent px-6 font-display font-bold text-on-accent hover:brightness-110">{place.id ? t('save') : t('create')}</button>
      </div>
    </form>
  );
}
