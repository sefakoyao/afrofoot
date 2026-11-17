import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { grantSigninExemption, sendSigninLink } from '@/app/actions/signin-help';
import { ResultBanner } from '@/components/ResultBanner';
import { requireArea } from '@/lib/auth';
import { dateFormats, isolate } from '@/lib/format';
import { getSupabase } from '@/lib/supabase/server';
import { helsinkiToday } from '@/lib/time';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('signin'))('title') };
}

type Status = {
  email: string | null; has_account: boolean; email_confirmed: boolean; last_sign_in_at: string | null; providers: string[]; banned_until: string | null;
  role: string; status: string; player_id: string | null; fee_blocked: boolean; owed_cents: number | null; oldest_due: string | null; exempt_until: string | null;
};
type Row = { id: string; email: string | null; phone: string | null; first_name: string | null; last_name: string | null; role: string; status: string };
type Finding = 'unconfirmed' | 'pending' | 'suspended' | 'fees' | 'banned' | 'social' | 'phone' | 'never' | 'none';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '');
const cleanQuery = (q: string) => q.replace(/[,()*%\\:"']/g, ' ').trim().slice(0, 60);
const input = 'min-h-11 w-full rounded-control border border-line bg-raised px-3';
const eur = (cents: number) => new Intl.NumberFormat('fi-FI', { style: 'currency', currency: 'EUR' }).format(cents / 100);
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

/** What stops the member from signing in, most important first (an account can have several). */
function findings(s: Status, phoneOnly: boolean): Finding[] {
  const out: Finding[] = [];
  if (phoneOnly) out.push('phone');
  else if (s.has_account && !s.email_confirmed) out.push('unconfirmed');
  if (s.status === 'pending') out.push('pending');
  if (s.status === 'suspended') out.push('suspended');
  if (s.fee_blocked) out.push('fees');
  if (s.banned_until) out.push('banned');
  if (s.providers.length && !s.providers.includes('email') && !s.providers.includes('phone')) out.push('social');
  if (!out.length && s.email_confirmed && !s.last_sign_in_at) out.push('never');
  return out.length ? out : ['none'];
}

/**
 * Admin → Sign-in help: find a member, see why they cannot sign in, send the right email (migration 0044).
 * Admins never see or set a password and cannot sign in as the member.
 */
export default async function SigninHelpPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireArea('admin');
  const sp = await searchParams;
  const [t, fmt, supabase] = await Promise.all([getTranslations('signin'), dateFormats(), getSupabase()]);
  const q = cleanQuery(one(sp.q));
  const memberId = UUID.test(one(sp.member)) ? one(sp.member) : '';
  const appUrl = (process.env.APP_URL || 'https://app.afrofoot.club').replace(/\/+$/, '');

  const [{ data: rows }, { data: picked }, statusAnswer] = supabase ? await Promise.all([
    q ? supabase.from('profiles').select('id, email, phone, first_name, last_name, role, status')
      .or(`email.ilike.*${q}*,phone.ilike.*${q}*,first_name.ilike.*${q}*,last_name.ilike.*${q}*`).order('last_name').limit(20) : Promise.resolve({ data: [] }),
    memberId ? supabase.from('profiles').select('id, email, phone, first_name, last_name, role, status').eq('id', memberId).maybeSingle() : Promise.resolve({ data: null }),
    memberId ? supabase.rpc('signin_status', { p_profile: memberId }) : Promise.resolve({ data: null }),
  ]) : [{ data: [] }, { data: null }, { data: null }];
  const m = picked as Row | null;
  const s = ((statusAnswer as { data: Status[] | null }).data ?? [])[0];
  const name = (r: Row) => [r.first_name, r.last_name].filter(Boolean).join(' ') || r.email || r.phone || '';
  const phoneOnly = !!m && !m.email && !!m.phone;
  const list = s && m ? findings(s, phoneOnly) : [];
  const today = helsinkiToday();
  const method = (p: string) => (['email', 'google', 'facebook', 'phone'].includes(p) ? t(`via_${p}` as 'via_email') : p);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <header>
        <h1 className="font-display text-2xl font-extrabold">{t('title')}</h1>
        <p className="mt-1 max-w-3xl text-muted">{t('lead')}</p>
      </header>
      <ResultBanner ns="signin" result={sp.result} />

      <form className="flex flex-wrap items-end gap-2" role="search">
        <label className="grid min-w-0 flex-1 gap-1 text-sm font-semibold sm:max-w-md">{t('search')}
          <input name="q" defaultValue={q} placeholder={t('searchEg')} className={input} data-signin-search /></label>
        <button className="min-h-11 rounded-full bg-accent px-6 font-display font-bold text-on-accent hover:brightness-110">{t('find')}</button>
      </form>

      {q ? (
        <section aria-label={t('results')} className="rounded-card border border-line bg-raised">
          {(rows as Row[] | null)?.length ? (
            <ul className="divide-y divide-line">
              {(rows as Row[]).map((r) => (
                <li key={r.id}>
                  <a href={`/admin/signin-help?q=${encodeURIComponent(q)}&member=${r.id}#help`} className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-accent/10 ${r.id === memberId ? 'bg-accent/10' : ''}`} data-signin-result={r.email ?? r.phone}>
                    <span><span className="font-semibold">{isolate(name(r))}</span> <span className="text-sm text-muted" dir="ltr"><bdi>{r.email ?? r.phone}</bdi></span></span>
                    <span className="text-sm font-semibold text-pitch">{t('open')} →</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : <p className="p-4 text-muted">{t('noResults')}</p>}
        </section>
      ) : null}

      {m && s ? (
        <section id="help" className="grid scroll-mt-4 gap-4 rounded-card border border-line bg-raised p-6" aria-labelledby="help-h" data-signin-member={m.email ?? m.phone}>
          <div>
            <h2 id="help-h" className="font-display text-xl font-extrabold">{isolate(name(m))}</h2>
            <p className="text-muted" dir="ltr" style={{ textAlign: 'start' }}><bdi>{m.email ?? m.phone}</bdi></p>
          </div>

          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div><dt className="text-muted">{t('f_account')}</dt><dd className="font-semibold">{t(`st_${s.status}` as 'st_active')}</dd></div>
            <div><dt className="text-muted">{t('f_confirmed')}</dt><dd className="font-semibold" data-fact="confirmed">{phoneOnly ? '–' : s.email_confirmed ? t('yes') : t('no')}</dd></div>
            <div><dt className="text-muted">{t('f_last')}</dt><dd className="font-semibold" data-fact="last">{s.last_sign_in_at ? fmt.dateTime.format(new Date(s.last_sign_in_at)) : t('never')}</dd></div>
            <div><dt className="text-muted">{t('f_methods')}</dt><dd className="font-semibold" data-fact="methods">{s.providers.length ? s.providers.map(method).join(', ') : '–'}</dd></div>
            {s.player_id ? <div><dt className="text-muted">{t('f_fees')}</dt><dd className="font-semibold" data-fact="fees">{s.owed_cents ? t('owes', { amount: eur(s.owed_cents), date: s.oldest_due ? fmt.date.format(new Date(`${s.oldest_due}T12:00:00Z`)) : '–' }) : t('nothingOwed')}</dd></div> : null}
            {s.exempt_until && s.exempt_until >= today ? <div><dt className="text-muted">{t('f_exempt')}</dt><dd className="font-semibold">{fmt.date.format(new Date(`${s.exempt_until}T12:00:00Z`))}</dd></div> : null}
          </dl>

          <div>
            <h3 className="font-display text-lg font-extrabold">{t('whatToDo')}</h3>
            <ol className="mt-2 grid gap-3">
              {list.map((f) => (
                <li key={f} className={`rounded-card p-4 ${f === 'none' || f === 'never' ? 'bg-accent/10' : 'bg-danger/10'}`} data-finding={f}>
                  <p className="font-semibold">{t(`fd_${f}`, { date: s.banned_until ? fmt.date.format(new Date(s.banned_until)) : '', amount: s.owed_cents ? eur(s.owed_cents) : '' })}</p>
                  <p className="mt-1 text-sm">{t(`fx_${f}`)}</p>
                  {f === 'unconfirmed' ? (
                    <form action={sendSigninLink} className="mt-2"><input type="hidden" name="member" value={m.id} /><input type="hidden" name="kind" value="confirmation" />
                      <button className="min-h-11 rounded-full bg-accent px-5 font-display font-bold text-on-accent hover:brightness-110" data-send="confirmation">{t('sendConfirmation')}</button></form>
                  ) : null}
                  {f === 'pending' || f === 'suspended' ? (
                    <a href={`/admin/members?q=${encodeURIComponent(m.email ?? m.phone ?? '')}`} className="mt-2 inline-block font-semibold text-pitch underline underline-offset-2">{t('toMembers')} →</a>
                  ) : null}
                  {f === 'fees' && s.player_id ? (
                    <div className="mt-2 grid gap-3">
                      <p className="text-sm">{t('payLink')} <a href={`${appUrl}/pay`} className="font-semibold text-pitch underline underline-offset-2" dir="ltr">{`${appUrl.replace(/^https?:\/\//, '')}/pay`}</a></p>
                      <form action={grantSigninExemption} className="grid gap-2 rounded-control bg-raised p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-end">
                        <input type="hidden" name="member" value={m.id} /><input type="hidden" name="player" value={s.player_id} />
                        <label className="grid gap-1 text-sm font-semibold">{t('exemptUntil')}<input type="date" name="until" required min={today} max={addDays(today, 90)} defaultValue={addDays(today, 7)} className={input} /></label>
                        <label className="grid gap-1 text-sm font-semibold">{t('exemptReason')}<input name="reason" required minLength={2} maxLength={200} placeholder={t('exemptReasonEg')} className={input} /></label>
                        <button className="min-h-11 rounded-full border-2 border-fg px-5 font-display font-bold hover:bg-fg hover:text-raised" data-exempt>{t('exempt')}</button>
                      </form>
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>

          {m.email ? (
            <div className="rounded-card border border-line p-4" data-password-box>
              <h3 className="font-display text-lg font-extrabold">{t('passwordTitle')}</h3>
              <p className="mt-1 text-sm text-muted">{t('passwordLead', { email: m.email })}</p>
              <form action={sendSigninLink} className="mt-3"><input type="hidden" name="member" value={m.id} /><input type="hidden" name="kind" value="password" />
                <button className="min-h-11 rounded-full bg-accent px-5 font-display font-bold text-on-accent hover:brightness-110" data-send="password">{t('sendPassword')}</button></form>
              <p className="mt-3 text-xs text-muted">{t('templateNote')}</p>
            </div>
          ) : null}

          <div className="rounded-card bg-surface p-4 text-sm">
            <p className="font-semibold">{t('tellThem')}</p>
            <ul className="mt-1 list-disc ps-5">
              <li>{t('tell_signin')} <span dir="ltr" className="font-semibold"><bdi>{`${appUrl.replace(/^https?:\/\//, '')}/login`}</bdi></span></li>
              <li>{t('tell_forgot')} <span dir="ltr" className="font-semibold"><bdi>{`${appUrl.replace(/^https?:\/\//, '')}/forgot-password`}</bdi></span></li>
              <li>{t('tell_spam')}</li>
            </ul>
          </div>
          <p className="text-xs text-muted">{t('privacy')}</p>
        </section>
      ) : memberId ? <p className="rounded-card bg-danger/10 p-4 font-semibold text-danger">{t('notFound')}</p> : null}
    </div>
  );
}
