import type { Metadata } from 'next';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { LOCALE_LABELS, TIME_ZONE, isLocale } from '@afrofoot/i18n';
import { mergeAccounts } from '@/app/actions/merge';
import { ResultBanner } from '@/components/ResultBanner';
import { requireArea } from '@/lib/auth';
import { getSupabase } from '@/lib/supabase/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('merge'))('title') };
}

const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
type Account = { id: string; email: string | null; phone: string | null; first_name: string; last_name: string; role: string; status: string; created_at: string };
const name = (a: Account) => `${a.first_name} ${a.last_name}`.trim() || a.email || a.phone || '–';

/** What hangs on one account: the numbers shown side by side before merging. */
async function footprint(db: SupabaseClient, profileId: string) {
  const { data: pl } = await db.from('players').select('id').eq('profile_id', profileId).maybeSingle();
  const { data: st } = await db.from('staff_members').select('id').eq('profile_id', profileId).maybeSingle();
  const { data: last } = await db.from('signin_events').select('created_at').eq('profile_id', profileId).eq('outcome', 'ok').order('created_at', { ascending: false }).limit(1).maybeSingle();
  const n = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;
  const pid = pl?.id as string | undefined;
  const [teams, games, trainings, invoices, unpaid, contracts, coaching] = await Promise.all([
    pid ? n(db.from('team_players').select('id', { count: 'exact', head: true }).eq('player_id', pid)) : 0,
    pid ? n(db.from('match_availability').select('id', { count: 'exact', head: true }).eq('player_id', pid)) : 0,
    pid ? n(db.from('session_attendance').select('id', { count: 'exact', head: true }).eq('player_id', pid)) : 0,
    pid ? n(db.from('payments').select('id', { count: 'exact', head: true }).eq('player_id', pid)) : 0,
    pid ? n(db.from('payments').select('id', { count: 'exact', head: true }).eq('player_id', pid).in('status', ['pending', 'failed'])) : 0,
    pid ? n(db.from('player_contracts').select('id', { count: 'exact', head: true }).eq('player_id', pid)) : 0,
    st ? n(db.from('team_staff').select('id', { count: 'exact', head: true }).eq('staff_id', st.id)) : 0,
  ]);
  return { player: !!pid, coach: !!st, lastSignIn: (last?.created_at as string | undefined) ?? null, teams, games, trainings, invoices, unpaid, contracts, coaching };
}

/** Contact details in the database's comparable form (see app.account_contacts): emails lower case, phones + and digits. */
const contacts = (a: Account) => [a.email?.toLowerCase(), a.phone ? `+${a.phone.replace(/\D/g, '')}` : null].filter((x): x is string => !!x);

/**
 * Admin → People → Merge accounts (migration 0065): one person with two accounts (e.g. signed up once with an email and
 * once with a phone number). The page lists accounts that share an email or phone, compares two side by side, and merges
 * the one to remove into the one to keep: teams, games, trainings, invoices, contracts, consents… all move, and the
 * removed login is deleted. The database (merge_accounts) re-checks every rule; past merges are listed below.
 */
export default async function MergePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireArea('admin');
  const [sp, t, tr, ts, locale, supabase] = await Promise.all([searchParams, getTranslations('merge'), getTranslations('role'), getTranslations('status'), getLocale(), getSupabase()]);
  if (!supabase) return null;
  const tag = isLocale(locale) ? LOCALE_LABELS[locale].intl : 'en-GB';
  const day = new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'short', year: 'numeric', timeZone: TIME_ZONE });
  const [{ data: pairs }, { data: all }, { data: history }] = await Promise.all([
    supabase.rpc('duplicate_accounts'),
    supabase.from('profiles').select('id, email, phone, first_name, last_name, role, status, created_at').order('first_name').order('last_name').limit(2000),
    supabase.from('account_merges').select('id, removed_name, removed_email, removed_phone, shared, merged_at, kept_profile_id, profiles!account_merges_kept_profile_id_fkey(first_name, last_name)').order('merged_at', { ascending: false }).limit(20),
  ]);
  const accounts = (all ?? []) as Account[];
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const dupes = ((pairs ?? []) as { a: string; b: string; shared: string }[]).filter((p) => byId.has(p.a) && byId.has(p.b));
  const a = byId.get(UUID.test(one(sp.a)) ? one(sp.a) : ''), b = byId.get(UUID.test(one(sp.b)) ? one(sp.b) : '');
  const kept = byId.get(one(sp.kept));
  const admins = ['super_admin', 'club_admin'];

  // the comparison: which one to keep by default — not my own account to remove, then active, then the older one
  let cmp: null | { left: Account; right: Account; fl: Awaited<ReturnType<typeof footprint>>; fr: Awaited<ReturnType<typeof footprint>>; shared: string | null; keepDefault: string; blocked: string | null } = null;
  if (a && b && a.id !== b.id) {
    const [fl, fr] = await Promise.all([footprint(supabase, a.id), footprint(supabase, b.id)]);
    const dupe = dupes.find((p) => (p.a === a.id && p.b === b.id) || (p.a === b.id && p.b === a.id));
    const shared = dupe?.shared ?? contacts(a).find((c) => contacts(b).includes(c)) ?? null;
    // default: my own account, then an active one, then the one with more history (player record, teams, games, invoices), then the older
    const weight = (f: Awaited<ReturnType<typeof footprint>>) => (f.player ? 3 : 0) + (f.coach ? 3 : 0) + Math.min(2, (f.teams + f.games + f.trainings + f.invoices + f.contracts) / 10);
    const score = (x: Account, f: Awaited<ReturnType<typeof footprint>>) => (x.id === me.id ? 100 : 0) + (x.status === 'active' ? 10 : 0) + weight(f) - Date.parse(x.created_at) / 1e14;
    const keepDefault = score(a, fl) >= score(b, fr) ? a.id : b.id;
    const blocked = !shared ? 'notShared' : (admins.includes(a.role) || admins.includes(b.role)) && me.role !== 'super_admin' ? 'adminOnlySuper' : null;
    cmp = { left: a, right: b, fl, fr, shared, keepDefault, blocked };
  }

  const select = 'min-h-11 w-full min-w-0 rounded-control border border-line bg-raised px-3';
  const card = (x: Account, f: Awaited<ReturnType<typeof footprint>>, checked: boolean, mine: boolean, otherMine: boolean) => (
    <label key={x.id} className="relative block cursor-pointer" data-merge-card={x.id}>
      <input type="radio" name="keep" value={x.id} defaultChecked={checked} disabled={otherMine} className="peer sr-only" />
      <span className="grid h-full content-start gap-2 rounded-card border-4 border-line bg-raised p-4 peer-checked:border-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent">
        <span className="flex flex-wrap items-center justify-between gap-2">
          <bdi className="font-display text-lg font-extrabold">{name(x)}</bdi>
          <span className="hidden rounded-full bg-accent px-3 py-0.5 text-xs font-bold text-on-accent [label:has(input:checked)_&]:inline">{t('keepTag')}</span>
          <span className="rounded-full bg-danger/10 px-3 py-0.5 text-xs font-bold text-danger [label:has(input:checked)_&]:hidden">{t('removeTag')}</span>
        </span>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted">{t('email')}</dt><dd className="break-all" dir="ltr">{x.email ?? '–'}</dd>
          <dt className="text-muted">{t('phone')}</dt><dd dir="ltr">{x.phone ?? '–'}</dd>
          <dt className="text-muted">{t('role')}</dt><dd>{tr(x.role as never)} · {ts(x.status as never)}</dd>
          <dt className="text-muted">{t('created')}</dt><dd>{day.format(new Date(x.created_at))}</dd>
          <dt className="text-muted">{t('lastSignIn')}</dt><dd>{f.lastSignIn ? day.format(new Date(f.lastSignIn)) : t('never')}</dd>
        </dl>
        <ul className="grid gap-1 rounded-control bg-surface p-3 text-sm" data-footprint>
          {f.player ? <>
            <li>{t('fTeams', { count: f.teams })}</li><li>{t('fGames', { count: f.games })}</li><li>{t('fTrainings', { count: f.trainings })}</li>
            <li>{t('fInvoices', { count: f.invoices, unpaid: f.unpaid })}</li><li>{t('fContracts', { count: f.contracts })}</li>
          </> : <li className="text-muted">{t('noPlayer')}</li>}
          {f.coach ? <li>{t('fCoaching', { count: f.coaching })}</li> : null}
        </ul>
        {mine ? <span className="text-xs font-semibold text-muted">{t('yourAccount')}</span> : null}
      </span>
    </label>
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <header>
        <p className="text-sm"><Link href="/admin/members" className="font-semibold text-pitch underline underline-offset-2">{t('back')}</Link></p>
        <h1 className="mt-1 font-display text-2xl font-extrabold">{t('title')}</h1>
        <p className="mt-1 max-w-3xl text-muted">{t('lead')}</p>
      </header>
      <ResultBanner ns="merge" result={sp.result} />
      {one(sp.result) === 'm_merged' && kept ? <p className="-mt-3 text-sm">{t('mergedInto')} <Link href={`/admin/members?q=${encodeURIComponent(kept.email ?? kept.phone ?? kept.last_name)}`} className="font-semibold text-pitch underline underline-offset-2"><bdi>{name(kept)}</bdi></Link></p> : null}

      {cmp ? (
        <section className="rounded-card border-2 border-accent bg-raised p-5 sm:p-6" aria-labelledby="cmp-h" data-merge-compare>
          <h2 id="cmp-h" className="font-display text-xl font-extrabold">{t('compareTitle')}</h2>
          <p className="mt-1 text-sm text-muted">{cmp.shared ? t('sharedLine', { shared: cmp.shared }) : null} {t('chooseKeep')}</p>
          <form action={mergeAccounts} className="mt-4 grid gap-4">
            <div className="grid gap-3 md:grid-cols-2">
              {card(cmp.left, cmp.fl, cmp.keepDefault === cmp.left.id, cmp.left.id === me.id, cmp.right.id === me.id)}
              {card(cmp.right, cmp.fr, cmp.keepDefault === cmp.right.id, cmp.right.id === me.id, cmp.left.id === me.id)}
            </div>
            {/* the pair; the server removes the one not chosen to keep */}
            <input type="hidden" name="a" value={cmp.left.id} /><input type="hidden" name="b" value={cmp.right.id} />
            <div className="rounded-card bg-surface p-4 text-sm">
              <p className="font-semibold">{t('whatHappens')}</p>
              <ul className="mt-2 list-disc space-y-1 ps-5">
                <li>{t('h1')}</li><li>{t('h2')}</li><li>{t('h3')}</li><li>{t('h4')}</li>
              </ul>
            </div>
            {cmp.blocked ? <p role="alert" className="rounded-card bg-danger/10 p-3 font-semibold text-danger" data-merge-blocked>{t(`m_${cmp.blocked}` as never)}</p> : (
              <>
                <label className="flex items-start gap-3 text-sm font-semibold"><input type="checkbox" name="confirm" required className="mt-0.5 size-5 accent-accent" data-merge-confirm />{t('confirm')}</label>
                <button className="min-h-11 justify-self-start rounded-full bg-accent px-6 font-display font-bold text-on-accent hover:brightness-110" data-merge-submit>{t('mergeBtn')}</button>
              </>
            )}
          </form>
        </section>
      ) : null}

      <section className="rounded-card border border-line bg-raised p-5 sm:p-6" aria-labelledby="dup-h" data-duplicates>
        <h2 id="dup-h" className="font-display text-xl font-extrabold">{t('dupTitle', { count: dupes.length })}</h2>
        <p className="mt-1 text-sm text-muted">{t('dupLead')}</p>
        {dupes.length === 0 ? <p className="mt-3 text-muted">{t('dupNone')}</p> : (
          <ul className="mt-3 divide-y divide-line">
            {dupes.map((p) => { const x = byId.get(p.a)!, y = byId.get(p.b)!; return (
              <li key={`${p.a}${p.b}`} className="flex flex-wrap items-center justify-between gap-3 py-3" data-duplicate={`${p.a}:${p.b}`}>
                <span className="min-w-0">
                  <span className="font-semibold"><bdi>{name(x)}</bdi> · <bdi>{name(y)}</bdi></span>
                  <span className="block text-sm text-muted" dir="auto">{t('sharedLine', { shared: p.shared })}</span>
                </span>
                <Link href={`/admin/members/merge?a=${p.a}&b=${p.b}#cmp-h`} className="inline-flex min-h-10 items-center rounded-full border-2 border-fg px-4 text-sm font-bold hover:border-accent" data-compare>{t('compare')}</Link>
              </li>); })}
          </ul>
        )}
      </section>

      <section className="rounded-card border border-line bg-raised p-5 sm:p-6" aria-labelledby="pick-h">
        <h2 id="pick-h" className="font-display text-xl font-extrabold">{t('pickTitle')}</h2>
        <p className="mt-1 text-sm text-muted">{t('pickLead')}</p>
        <form method="get" className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end" data-merge-pick>
          {(['a', 'b'] as const).map((k, i) => (
            <label key={k} className="grid gap-1 text-sm font-semibold">{t(i ? 'pickSecond' : 'pickFirst')}
              <select key={`${k}-${(k === 'a' ? a : b)?.id ?? ''}`} name={k} required defaultValue={(k === 'a' ? a : b)?.id ?? ''} className={`${select} font-normal`}>
                <option value="" disabled>{t('pickNone')}</option>
                {accounts.map((x) => <option key={x.id} value={x.id}>{name(x)} · {x.email ?? x.phone}</option>)}
              </select></label>
          ))}
          <button className="min-h-11 rounded-full bg-accent px-6 font-display font-bold text-on-accent hover:brightness-110">{t('compare')}</button>
        </form>
      </section>

      {(history ?? []).length ? (
        <section className="rounded-card border border-line bg-raised p-5 sm:p-6" aria-labelledby="hist-h" data-merge-history>
          <h2 id="hist-h" className="font-display text-xl font-extrabold">{t('historyTitle')}</h2>
          <ul className="mt-3 divide-y divide-line text-sm">
            {((history ?? []) as unknown as { id: string; removed_name: string; removed_email: string | null; removed_phone: string | null; shared: string; merged_at: string; profiles: { first_name: string; last_name: string } | null }[]).map((h) => (
              <li key={h.id} className="py-2">{day.format(new Date(h.merged_at))} · {t('historyLine', { removed: `${h.removed_name} (${h.removed_email ?? h.removed_phone ?? '–'})`, kept: h.profiles ? `${h.profiles.first_name} ${h.profiles.last_name}` : '–' })}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
