'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

export type PlaceOption = { id: string; name: string; city: string | null };
const input = 'min-h-11 w-full rounded-control border border-line bg-raised px-3';

/**
 * Where: a saved place, or "+ Add a new place" which opens name / address / city / Google Maps link fields right here.
 * "Find it on Google Maps" opens a search for what was typed, so the coach can copy the place's share link.
 * Leaving the link empty is fine: the server makes a Google Maps link from the address (lib/locations.ts).
 */
export function LocationPicker({ places, className = '' }: { places: PlaceOption[]; className?: string }) {
  const t = useTranslations('events');
  const [choice, setChoice] = useState('');
  const [q, setQ] = useState({ name: '', address: '', city: '' });
  const query = [q.name, q.address, q.city].map((s) => s.trim()).filter(Boolean).join(', ');
  return (
    <div className={`grid gap-3 ${className}`} data-location-picker>
      <label className="grid gap-1 text-sm font-semibold">{t('location')}
        <select name="location_id" value={choice} onChange={(e) => setChoice(e.target.value)} className={input}>
          <option value="">{t('noLocation')}</option>
          {places.map((l) => <option key={l.id} value={l.id}>{l.name}{l.city ? ` · ${l.city}` : ''}</option>)}
          <option value="new">{t('newLocation')}</option>
        </select>
      </label>
      {choice === 'new' ? (
        <fieldset className="grid gap-3 rounded-card border border-dashed border-line p-3 sm:grid-cols-2" data-new-location>
          <legend className="px-1 text-sm font-bold">{t('newLocationTitle')}</legend>
          <label className="grid gap-1 text-sm font-semibold sm:col-span-2">{t('locName')}
            <input name="loc_name" required minLength={2} maxLength={120} placeholder={t('locNameEg')} className={input} onChange={(e) => setQ({ ...q, name: e.target.value })} /></label>
          <label className="grid gap-1 text-sm font-semibold">{t('locAddress')}
            <input name="loc_address" maxLength={200} autoComplete="street-address" className={input} onChange={(e) => setQ({ ...q, address: e.target.value })} /></label>
          <label className="grid gap-1 text-sm font-semibold">{t('locCity')}
            <input name="loc_city" maxLength={80} defaultValue="" placeholder="Helsinki" className={input} onChange={(e) => setQ({ ...q, city: e.target.value })} /></label>
          <label className="grid gap-1 text-sm font-semibold sm:col-span-2">{t('locMaps')}
            <input name="loc_maps" type="url" inputMode="url" maxLength={500} pattern="https://.+" placeholder="https://maps.app.goo.gl/…" className={input} dir="ltr" />
            <span className="text-xs font-normal text-muted">{t('locMapsHint')}</span></label>
          {query ? (
            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`} target="_blank" rel="noopener noreferrer" data-find-on-maps
              className="inline-flex min-h-10 w-fit items-center gap-2 rounded-full border-2 border-fg px-4 text-sm font-bold hover:bg-fg hover:text-raised sm:col-span-2">
              <PinIcon /> {t('findOnMaps')}<span className="sr-only"> ({t('newTab')})</span>
            </a>
          ) : null}
        </fieldset>
      ) : null}
    </div>
  );
}

export function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 shrink-0" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" />
    </svg>
  );
}
