import { getTranslations } from 'next-intl/server';
import { createEvent, setEventStatus } from '@/app/actions/events';
import { EVENT_KINDS } from '@/lib/events';
import { mapsLinkFor } from '@/lib/locations';
import { helsinkiToday } from '@/lib/time';
import { KindFields } from './KindFields';
import { LocationPicker, PinIcon, type PlaceOption } from './LocationPicker';

const input = 'min-h-11 w-full rounded-control border border-line bg-raised px-3';

/** Optional meeting time and meeting point, for training, matches and events. */
export async function MeetFields({ defaultTime = '', match = false }: { defaultTime?: string; match?: boolean }) {
  const t = await getTranslations('events');
  return (
    <>
      <label className="grid gap-1 text-sm font-semibold">{t('meetTime')}<input name="meet" type="time" defaultValue={defaultTime} className={input} />
        <span className="text-xs font-normal text-muted">{t(match ? 'meetHintMatch' : 'meetHint')}</span></label>
      <label className="grid gap-1 text-sm font-semibold">{t('meetPoint')}<input name="meeting_point" maxLength={120} placeholder={t('meetPointEg')} className={input} /></label>
    </>
  );
}

/** "Show on the club website" (checked by default). */
export async function PublicField({ className = '' }: { className?: string }) {
  const t = await getTranslations('events');
  return (
    <label className={`flex items-start gap-3 rounded-card bg-raised p-3 text-sm ${className}`}>
      <input type="checkbox" name="public" defaultChecked className="mt-0.5 size-5 accent-accent" />
      <span><span className="font-semibold">{t('public')}</span><span className="block text-xs text-muted">{t('publicHint')}</span></span>
    </label>
  );
}

/**
 * Add an event: for one team (coach: own teams) or, for admins, the whole club. With `sport` (Admin → Events) the type list
 * also offers Training, Game and Friendly game; fields that do not apply to the chosen type hide themselves (CSS :has).
 */
export async function EventForm({ back, places, teams, fixedTeam, sport = false, opponents, clubWide = true }: { back: string; places: PlaceOption[]; teams?: { id: string; name: string }[]; fixedTeam?: string; sport?: boolean; opponents?: string[]; /** false for coaches: one of their teams, no whole-club option */ clubWide?: boolean }) {
  const t = await getTranslations('events');
  return (
    <form action={createEvent} className="mt-3 grid gap-3 sm:grid-cols-2" data-event-form>
      <input type="hidden" name="back" value={back} />
      {fixedTeam ? <input type="hidden" name="team_season_id" value={fixedTeam} /> : (
        <label className="grid gap-1 text-sm font-semibold sm:col-span-2">{t('forTeam')}
          <select name="team_season_id" defaultValue={clubWide ? '' : teams?.[0]?.id ?? ''} required={!clubWide} className={input}>
            {clubWide ? <option value="">{t('wholeClub')}</option> : null}
            {(teams ?? []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select></label>
      )}
      <KindFields kinds={EVENT_KINDS} sport={sport} defaultKind="meeting" opponents={opponents} />
      <label className="grid gap-1 text-sm font-semibold">{t('date')}<input name="date" type="date" required min={helsinkiToday()} defaultValue={helsinkiToday()} className={input} /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1 text-sm font-semibold">{t('start')}<input name="start" type="time" required defaultValue="18:00" className={input} /></label>
        <label className="grid gap-1 text-sm font-semibold [form:has(select[name=kind]_option[value=game]:checked)_&]:hidden [form:has(select[name=kind]_option[value=friendly]:checked)_&]:hidden" data-end-time>{t('end')}<input name="end" type="time" required defaultValue="19:00" className={input} /></label>
      </div>
      <label className={`grid gap-1 text-sm font-semibold ${sport ? '[form:has(select[name=kind]_option[value=game]:checked)_&]:hidden [form:has(select[name=kind]_option[value=friendly]:checked)_&]:hidden [form:has(select[name=kind]_option[value=training]:checked)_&]:hidden' : ''}`} data-end-date>{t('endDate')}<input name="end_date" type="date" min={helsinkiToday()} className={input} />
        <span className="text-xs font-normal text-muted">{t('endDateHint')}</span></label>
      <div className="hidden sm:block" />
      <MeetFields />
      <LocationPicker places={places} className="sm:col-span-2" />
      <label className={`grid gap-1 text-sm font-semibold sm:col-span-2 ${sport ? '[form:has(select[name=kind]_option[value=game]:checked)_&]:hidden [form:has(select[name=kind]_option[value=friendly]:checked)_&]:hidden' : ''}`} data-description>{t('description')}<textarea name="description" maxLength={2000} rows={3} className="w-full rounded-control border border-line bg-raised p-3" /></label>
      <PublicField className={`sm:col-span-2 ${sport ? '[form:has(select[name=kind]_option[value=game]:checked)_&]:hidden [form:has(select[name=kind]_option[value=friendly]:checked)_&]:hidden' : ''}`} />
      <button className="min-h-11 rounded-full bg-accent px-6 font-display font-bold text-on-accent hover:brightness-110 sm:col-span-2 sm:justify-self-start">{t('add')}</button>
    </form>
  );
}

export type EventRow = {
  id: string; kind: string; title: string; starts_at: string; ends_at: string; meet_at: string | null; meeting_point: string | null; status: string; public: boolean;
  team_season_id: string | null; description: string | null; locations: { name: string; address: string | null; city: string | null; maps_url: string | null } | null;
};

/** Upcoming events with time, meeting, place (Google Maps link) and, where allowed, cancel / restore. */
export async function EventList({ events, back, canChange, teamName, fmt }: {
  events: EventRow[]; back: string; canChange: (e: EventRow) => boolean; teamName?: (id: string | null) => string | null;
  fmt: { when: Intl.DateTimeFormat; hm: Intl.DateTimeFormat };
}) {
  const t = await getTranslations('events');
  if (!events.length) return <p className="mt-2 text-muted">{t('noEvents')}</p>;
  return (
    <ul className="mt-2 divide-y divide-line" data-event-list>
      {events.map((e) => {
        const link = e.locations ? mapsLinkFor(e.locations) : null;
        const off = e.status === 'cancelled';
        return (
          <li key={e.id} className="grid gap-1 py-3" data-club-event={e.title} data-status={e.status}>
            <p className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-fg/10 px-2 py-0.5 text-xs font-bold">{t(`kind_${e.kind}` as 'kind_other')}</span>
              <span className={`font-semibold ${off ? 'line-through' : ''}`}>{fmt.when.format(new Date(e.starts_at))} · <bdi>{e.title}</bdi></span>
              {teamName ? <span className="text-sm text-muted">{teamName(e.team_season_id) ?? t('wholeClub')}</span> : null}
              <span className="rounded-full bg-line px-2 py-0.5 text-xs font-bold">{e.public ? t('onWebsite') : t('membersOnly')}</span>
              {off ? <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs font-bold text-danger">{t('cancelled')}</span> : null}
            </p>
            {e.meet_at ? <p className="text-sm"><span className="text-muted">{t('meeting')}</span> <b dir="ltr">{fmt.hm.format(new Date(e.meet_at))}</b>{e.meeting_point ? <> · <bdi>{e.meeting_point}</bdi></> : null}</p> : null}
            {e.locations ? (
              <p className="text-sm">{[e.locations.name, e.locations.address, e.locations.city].filter(Boolean).join(', ')}
                {link ? <> · <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-pitch underline underline-offset-2"><PinIcon />{t('openMaps')}</a></> : null}</p>
            ) : null}
            {e.description ? <p className="whitespace-pre-line text-sm text-muted">{e.description}</p> : null}
            {canChange(e) ? (
              <form action={setEventStatus}>
                <input type="hidden" name="event_id" value={e.id} /><input type="hidden" name="back" value={back} /><input type="hidden" name="status" value={off ? 'scheduled' : 'cancelled'} />
                <button className="min-h-9 rounded-full border border-line px-3 text-xs font-bold hover:border-accent">{off ? t('restore') : t('cancel')}</button>
              </form>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
