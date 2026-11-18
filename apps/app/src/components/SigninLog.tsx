import type { SupabaseClient } from '@supabase/supabase-js';
import { getTranslations } from 'next-intl/server';
import { dateFormats, isolate } from '@/lib/format';

/** Sign-in log of migration 0051, as shown in Admin → Sign-in help. */
export type SigninEvent = {
  id: number; created_at: string; profile_id: string | null; email: string | null; method: string; outcome: string; detail: string | null;
  profiles: { first_name: string | null; last_name: string | null } | null;
};
export const PERIODS = [1, 7, 30, 90] as const;
export const LOG_FILTERS = ['all', 'failed', 'ok', 'reset'] as const;
const FAILED = ['wrong_password', 'not_confirmed', 'pending', 'suspended', 'fee_blocked', 'rate_limited', 'error'];
const RESET_BAD = ['reset_failed', 'reset_rate_limited'];
const SELECT = 'id, created_at, profile_id, email, method, outcome, detail, profiles(first_name, last_name)';

const tone = (o: string) => (o === 'ok' || o === 'reset_sent' ? 'bg-accent/20 text-pitch' : RESET_BAD.includes(o) || o === 'error' ? 'bg-danger text-white' : 'bg-danger/15 text-danger');
const who = (e: SigninEvent) => [e.profiles?.first_name, e.profiles?.last_name].filter(Boolean).join(' ');
const matches = (e: SigninEvent, f: (typeof LOG_FILTERS)[number]) =>
  f === 'all' || (f === 'ok' && e.outcome === 'ok') || (f === 'failed' && FAILED.includes(e.outcome)) || (f === 'reset' && e.method === 'reset');

/** One event: time, person (or the email typed), method, outcome and the technical detail when there is one. */
async function EventList({ rows, showWho }: { rows: SigninEvent[]; showWho: boolean }) {
  const [t, fmt] = await Promise.all([getTranslations('signin'), dateFormats()]);
  return (
    <ul className="divide-y divide-line text-sm">
      {rows.map((e) => (
        <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2" data-signin-event={e.outcome}>
          <span className="w-36 shrink-0 text-muted">{fmt.dateTime.format(new Date(e.created_at))}</span>
          {showWho ? (
            <span className="min-w-0 flex-1">
              {e.profile_id
                ? <a href={`/admin/signin-help?member=${e.profile_id}#help`} className="font-semibold text-pitch underline-offset-2 hover:underline">{isolate(who(e) || e.email || '')}</a>
                : <span className="font-semibold">{t('log_noAccount')}</span>}
              {e.email ? <span className="ms-2 text-muted" dir="ltr"><bdi>{e.email}</bdi></span> : null}
            </span>
          ) : null}
          <span className="text-muted">{t(`log_m_${e.method}` as 'log_m_password')}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${tone(e.outcome)}`}>{t(`log_o_${e.outcome}` as 'log_o_ok')}</span>
          {e.detail ? <span className="basis-full text-xs text-muted sm:basis-auto" dir="ltr"><bdi>{e.detail}</bdi></span> : null}
        </li>
      ))}
    </ul>
  );
}

/** A member's own recent attempts (any age within the 90 days kept) and what Supabase Auth recorded for them. */
export async function MemberSigninLog({ db, profileId }: { db: SupabaseClient; profileId: string }) {
  const [t, fmt] = await Promise.all([getTranslations('signin'), dateFormats()]);
  const [{ data }, { data: auth }] = await Promise.all([
    db.from('signin_events').select(SELECT).eq('profile_id', profileId).order('created_at', { ascending: false }).limit(15),
    db.rpc('signin_auth_log', { p_profile: profileId, p_limit: 10 }),
  ]);
  const rows = (data ?? []) as unknown as SigninEvent[];
  const authRows = (auth ?? []) as { created_at: string; action: string; provider: string | null }[];
  return (
    <div className="rounded-card border border-line p-4" data-member-log>
      <h3 className="font-display text-lg font-extrabold">{t('log_memberTitle')}</h3>
      {rows.length ? <EventList rows={rows} showWho={false} /> : <p className="mt-1 text-sm text-muted">{t('log_memberEmpty')}</p>}
      {authRows.length ? (
        <details className="mt-3" data-auth-log>
          <summary className="cursor-pointer text-sm font-semibold text-pitch">{t('log_authTitle')}</summary>
          <ul className="mt-2 grid gap-1 text-sm">
            {authRows.map((a, i) => (
              <li key={i} className="flex gap-3"><span className="w-36 shrink-0 text-muted">{fmt.dateTime.format(new Date(a.created_at))}</span>
                <span>{t.has(`log_a_${a.action}` as 'log_a_login') ? t(`log_a_${a.action}` as 'log_a_login') : a.action}{a.provider ? ` · ${a.provider}` : ''}</span></li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

/**
 * Summary for a period: successful and failed sign-ins, failure reasons, password-reset emails (and how many Supabase
 * could not send), members with repeated failures and no success since, and the latest attempts.
 */
export async function SigninLog({ db, days, filter, q }: { db: SupabaseClient; days: (typeof PERIODS)[number]; filter: (typeof LOG_FILTERS)[number]; q: string }) {
  const t = await getTranslations('signin');
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const { data } = await db.from('signin_events').select(SELECT).gte('created_at', since).order('created_at', { ascending: false }).limit(3000);
  const rows = (data ?? []) as unknown as SigninEvent[];
  const count = (f: (e: SigninEvent) => boolean) => rows.filter(f).length;
  const ok = count((e) => e.outcome === 'ok'), failed = count((e) => FAILED.includes(e.outcome));
  const resetSent = count((e) => e.outcome === 'reset_sent'), resetBad = count((e) => RESET_BAD.includes(e.outcome));
  const people = new Set(rows.filter((e) => e.outcome === 'ok').map((e) => e.profile_id)).size;
  const reasons = FAILED.map((o) => [o, count((e) => e.outcome === o)] as const).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);

  // people with 2+ failures (or a reset email that could not be sent) and no successful sign-in after the last one
  const groups = new Map<string, { last: SigninEvent; failures: number; resetBad: number; okAfter: boolean }>();
  for (const e of [...rows].reverse()) {
    const key = e.profile_id ?? `@${e.email}`;
    const g = groups.get(key) ?? { last: e, failures: 0, resetBad: 0, okAfter: false };
    if (e.outcome === 'ok') g.okAfter = true;
    else if (FAILED.includes(e.outcome) || RESET_BAD.includes(e.outcome)) {
      if (FAILED.includes(e.outcome)) g.failures++; else g.resetBad++;
      g.last = e; g.okAfter = false;
    }
    groups.set(key, g);
  }
  const trouble = [...groups.values()].filter((g) => !g.okAfter && (g.failures >= 2 || g.resetBad > 0))
    .sort((a, b) => b.failures + b.resetBad - (a.failures + a.resetBad) || b.last.created_at.localeCompare(a.last.created_at)).slice(0, 15);
  const recent = rows.filter((e) => matches(e, filter)).slice(0, 40);
  const href = (d: number, f: string) => `/admin/signin-help?${new URLSearchParams({ ...(q ? { q } : {}), days: String(d), log: f })}#log`;
  const Tile = ({ k, n, warn }: { k: string; n: number; warn?: boolean }) => (
    <div className={`rounded-card p-4 ${warn ? 'bg-danger/10' : 'bg-surface'}`} data-tile={k}>
      <p className={`font-display text-3xl font-extrabold ${warn ? 'text-danger' : ''}`}>{n}</p>
      <p className="text-sm text-muted">{t(`log_t_${k}` as 'log_t_ok', { people })}</p>
    </div>
  );

  return (
    <section id="log" className="grid scroll-mt-4 gap-4 rounded-card border border-line bg-raised p-6" aria-labelledby="log-h" data-signin-log>
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="log-h" className="font-display text-xl font-extrabold">{t('log_title')}</h2>
        <nav aria-label={t('log_period')} className="ms-auto flex flex-wrap gap-2">
          {PERIODS.map((d) => (
            <a key={d} href={href(d, filter)} aria-current={d === days ? 'page' : undefined} data-period={d}
              className={`inline-flex min-h-10 items-center rounded-full border-2 px-4 text-sm font-semibold ${d === days ? 'border-accent bg-accent text-on-accent' : 'border-line hover:border-accent'}`}>
              {t('log_days', { count: d })}</a>
          ))}
        </nav>
      </div>
      <p className="-mt-2 text-sm text-muted">{t('log_lead')}</p>

      {resetBad ? (
        <div role="alert" className="rounded-card bg-danger/10 p-4" data-reset-warning>
          <p className="font-semibold text-danger">{t('log_resetWarn', { count: resetBad })}</p>
          <p className="mt-1 text-sm">{t('log_resetFix')}</p>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile k="ok" n={ok} />
        <Tile k="failed" n={failed} warn={failed > 0 && failed >= ok} />
        <Tile k="resetSent" n={resetSent} />
        <Tile k="resetBad" n={resetBad} warn={resetBad > 0} />
      </div>

      {reasons.length ? (
        <div>
          <h3 className="font-display font-bold">{t('log_reasons')}</h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {reasons.map(([o, n]) => <li key={o} className="rounded-full bg-surface px-3 py-1 text-sm" data-reason={o}><span className="font-bold">{n}</span> {t(`log_o_${o}` as 'log_o_ok')}</li>)}
          </ul>
        </div>
      ) : null}

      <div>
        <h3 className="font-display font-bold">{t('log_trouble')}</h3>
        {trouble.length ? (
          <ul className="mt-2 divide-y divide-line rounded-card border border-line">
            {trouble.map((g) => (
              <li key={g.last.profile_id ?? g.last.email} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm" data-trouble={g.last.email ?? ''}>
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{g.last.profile_id ? isolate(who(g.last) || g.last.email || '') : t('log_noAccount')}</span>
                  {g.last.email ? <span className="ms-2 text-muted" dir="ltr"><bdi>{g.last.email}</bdi></span> : null}
                </span>
                <span>{[g.failures ? t('log_failures', { count: g.failures }) : null, g.resetBad ? t('log_resetBadShort', { count: g.resetBad }) : null].filter(Boolean).join(' · ')}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${tone(g.last.outcome)}`}>{t(`log_o_${g.last.outcome}` as 'log_o_ok')}</span>
                {g.last.profile_id ? <a href={`/admin/signin-help?member=${g.last.profile_id}#help`} className="font-semibold text-pitch underline underline-offset-2">{t('log_help')}</a> : null}
              </li>
            ))}
          </ul>
        ) : <p className="mt-1 text-sm text-muted" data-no-trouble>{t('log_noTrouble')}</p>}
      </div>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="me-auto font-display font-bold">{t('log_recent')}</h3>
          {LOG_FILTERS.map((f) => (
            <a key={f} href={href(days, f)} aria-current={f === filter ? 'page' : undefined} data-log-filter={f}
              className={`inline-flex min-h-9 items-center rounded-full border-2 px-3 text-sm font-semibold ${f === filter ? 'border-ink-950 bg-ink-950 text-white' : 'border-line hover:border-ink-950'}`}>
              {t(`log_f_${f}`)}</a>
          ))}
        </div>
        {recent.length ? <EventList rows={recent} showWho /> : <p className="mt-2 text-sm text-muted" data-log-empty>{t('log_empty')}</p>}
      </div>
      <p className="text-xs text-muted">{t('log_privacy')}</p>
    </section>
  );
}
