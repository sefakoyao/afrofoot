import type { Metadata } from 'next';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { LOCALE_LABELS, TIME_ZONE, isLocale } from '@afrofoot/i18n';
import { requireArea } from '@/lib/auth';
import { getSupabase } from '@/lib/supabase/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('creq'))('title') };
}

type Row = { kind: 'tryout' | 'enrolment'; id: string; created_at: string; status: string; first_name: string; last_name: string; date_of_birth: string | null;
  email: string | null; phone: string | null; position: string | null; nationality: string | null; previous_team: string | null; palloliitto_url: string | null;
  guardian_name: string | null; guardian_phone: string | null; message: string | null; tryout_on: string | null; plan: string | null };
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '');
const BADGE: Record<string, string> = { new: 'bg-accent text-on-accent', in_review: 'bg-ink-950 text-white', accepted: 'bg-accent/20 text-pitch', declined: 'bg-danger/15 text-danger', archived: 'bg-line text-muted' };
const ageOn = (dob: string, today = new Date()) => { const d = new Date(dob); let a = today.getFullYear() - d.getFullYear(); if (today.getMonth() < d.getMonth() || (today.getMonth() === d.getMonth() && today.getDate() < d.getDate())) a--; return a; };

/**
 * Coach → Teams & events → Requests (migration 0066): tryout requests and team enrolments from the website, read only,
 * for coaches and player-coaches. What a coach needs to plan a tryout and welcome a player; the address, payment choice
 * and the admins' notes stay with the admins, who also set the status and tryout date (Admin → Requests).
 */
export default async function CoachRequestsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireArea('coach');
  const [sp, t, tr, tp, locale, supabase] = await Promise.all([searchParams, getTranslations('creq'), getTranslations('req'), getTranslations('position'), getLocale(), getSupabase()]);
  const all = one(sp.show) === 'all';
  const kind = (['tryout', 'enrolment'] as const).find((k) => k === one(sp.kind));
  const { data } = supabase ? await supabase.rpc('coach_requests', { p_all: all }) : { data: [] };
  const rows = ((data ?? []) as Row[]).filter((r) => !kind || r.kind === kind);
  const tag = isLocale(locale) ? LOCALE_LABELS[locale].intl : 'en-GB';
  const day = new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'short', year: 'numeric', timeZone: TIME_ZONE });
  const pos = (p: string | null) => (p && ['goalkeeper', 'defender', 'midfielder', 'forward'].includes(p) ? tp(p as 'goalkeeper') : p ?? '');
  const href = (k?: string, show = all) => `/coach/requests?${new URLSearchParams({ ...(k ? { kind: k } : {}), ...(show ? { show: 'all' } : {}) })}`;
  const chip = (on: boolean) => `inline-flex min-h-10 items-center rounded-full px-4 text-sm font-bold ${on ? 'bg-accent text-on-accent' : 'border border-line bg-raised hover:border-accent'}`;
  const field = (label: string, value: React.ReactNode) => (value ? <div><dt className="text-muted">{label}</dt><dd className="font-semibold">{value}</dd></div> : null);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <header>
        <h1 className="font-display text-2xl font-extrabold">{t('title')}</h1>
        <p className="mt-1 max-w-3xl text-muted">{t('lead')}</p>
      </header>
      <nav className="flex flex-wrap items-center gap-2" aria-label={tr('filter')}>
        <Link href={href()} className={chip(!kind)} aria-current={!kind ? 'page' : undefined}>{tr('k_all')}</Link>
        <Link href={href('tryout')} className={chip(kind === 'tryout')} aria-current={kind === 'tryout' ? 'page' : undefined}>{tr('k_tryout')}</Link>
        <Link href={href('enrolment')} className={chip(kind === 'enrolment')} aria-current={kind === 'enrolment' ? 'page' : undefined}>{tr('k_enrolment')}</Link>
        <Link href={href(kind, !all)} className="ms-auto text-sm font-semibold text-pitch underline underline-offset-2" data-show-all>{all ? tr('showOpen') : t('showAll')}</Link>
      </nav>
      {rows.length === 0 ? <p className="rounded-card border border-line bg-raised p-6 text-muted">{all ? tr('emptyAll') : t('empty')}</p> : (
        <ul className="grid gap-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-card border border-line bg-raised" data-coach-request={r.kind}>
              <details>
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-x-4 gap-y-1 p-4">
                  <span className="min-w-0">
                    <span className="me-2 rounded-full bg-surface px-2 py-0.5 text-xs font-bold">{tr(`k_${r.kind}_one`)}</span>
                    <bdi className="font-semibold">{r.first_name} {r.last_name}</bdi>
                    <span className="block text-sm text-muted">{[pos(r.position), r.date_of_birth ? tr('age', { age: ageOn(r.date_of_birth) }) : null, r.previous_team].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className="flex items-center gap-2 text-sm text-muted">
                    {r.tryout_on ? <span data-tryout-on>{tr('tryoutOn')}: <span className="font-semibold text-fg">{day.format(new Date(r.tryout_on))}</span></span> : null}
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${BADGE[r.status] ?? 'bg-line'}`}>{tr(`st_${r.status}` as 'st_new')}</span>
                    <span>{day.format(new Date(r.created_at))}</span>
                  </span>
                </summary>
                <div className="grid gap-3 border-t border-line p-4">
                  {r.message ? <p className="whitespace-pre-line rounded-control bg-surface p-3 text-sm" dir="auto">{r.message}</p> : null}
                  <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                    {field(tr('f_phone'), r.phone ? <a href={`tel:${r.phone.replace(/[^\d+]/g, '')}`} dir="ltr" className="text-pitch underline underline-offset-2">{r.phone}</a> : null)}
                    {field(tr('f_email'), r.email ? <a href={`mailto:${r.email}`} className="break-all text-pitch underline underline-offset-2">{r.email}</a> : null)}
                    {field(tr('f_guardian'), [r.guardian_name, r.guardian_phone].filter(Boolean).join(' · ') || null)}
                    {field(tr('f_nationality'), r.nationality)}
                    {field(tr('f_plan'), r.plan)}
                    {field(tr('f_palloliitto'), r.palloliitto_url ? <a href={r.palloliitto_url} target="_blank" rel="noopener noreferrer" className="text-pitch underline underline-offset-2">{t('openProfile')}</a> : null)}
                  </dl>
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">{t('privacy')}</p>
    </div>
  );
}
