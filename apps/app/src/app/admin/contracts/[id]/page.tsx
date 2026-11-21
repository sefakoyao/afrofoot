import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { relationLabel } from '@/lib/relations';
import { contractStep, saveContract } from '@/app/actions/contracts';
import { ConductText } from '@/components/ConductText';
import { ContractSignatures } from '@/components/ContractSignatures';
import { SignatureMark } from '@/components/SignatureMark';
import { ResultBanner } from '@/components/ResultBanner';
import { requireArea } from '@/lib/auth';
import { contractColumns, readContracts, STATUS_BADGE, loadContractSettings, blanksIn, hasBlanks, shownStatus, type Contract } from '@/lib/contracts';
import { dateFormats } from '@/lib/format';
import { getSupabase } from '@/lib/supabase/server';
import { helsinkiToday } from '@/lib/time';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('contract'))('adminTitle') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const input = 'min-h-11 w-full rounded-control border border-line bg-raised px-3';

/** One contract: edit the draft, send, countersign after the player, cancel, terminate; PDF once sent. */
export default async function ContractPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireArea('admin');
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const [t, trel, fmt, supabase] = await Promise.all([getTranslations('contract'), getTranslations('relation'), dateFormats(), getSupabase()]);
  if (!supabase) notFound();
  const { data } = await readContracts((_, minor) => supabase.from('player_contracts').select(`${contractColumns(minor)}, players!inner(first_name, last_name)`).eq('id', id).maybeSingle());
  if (!data) notFound();
  const settings = await loadContractSettings(supabase);
  // who the club's signature names: the signatory set in the contract settings (0052), else the admin who countersigns
  const signer = settings.signatory_name || `${me.firstName} ${me.lastName}`.trim();
  const c = data as unknown as Contract & { players: { first_name: string; last_name: string } };
  const st = shownStatus(c, helsinkiToday());
  // 0068: a player under 18 signs together with a parent or guardian; countersigning waits for them
  const minorNow = ((await supabase.rpc('minor_players')).data as string[] | null ?? []).includes(c.player_id);
  const under18 = !!c.is_minor || (minorNow && ['draft', 'sent'].includes(c.status));
  const guardianMissing = c.status === 'player_signed' && !!c.is_minor && !c.guardian_signed_at;
  const d = (iso: string) => fmt.date.format(new Date(`${iso}T12:00:00Z`));
  const blanks = hasBlanks(c.body);
  const missing = blanksIn(c.body);
  const fixHref = { objectives: c.team_season_id ? `/admin/teams/${c.team_season_id}#objectives` : null, fees: '/admin/contracts#auto-h', text: null } as const;
  const Step = ({ op, label, tone = 'primary', confirm }: { op: string; label: string; tone?: 'primary' | 'secondary' | 'danger'; confirm?: string }) => (
    <form action={contractStep}>
      <input type="hidden" name="id" value={c.id} /><input type="hidden" name="op" value={op} />
      {confirm ? <p className="mb-2 text-sm text-muted">{confirm}</p> : null}
      <button data-step={op} className={`min-h-11 rounded-full px-6 font-display font-bold ${tone === 'danger' ? 'border-2 border-danger text-danger hover:bg-danger/10' : tone === 'secondary' ? 'border-2 border-fg hover:bg-fg hover:text-raised' : 'bg-accent text-on-accent hover:brightness-110'}`}>{label}</button>
    </form>
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <Link href="/admin/contracts" className="text-sm font-semibold text-pitch underline underline-offset-2">← {t('adminTitle')}</Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold"><bdi>{c.players.first_name} {c.players.last_name}</bdi></h1>
          <p className="mt-1 text-muted">{c.title} · {d(c.starts_on)} – {d(c.ends_on)} · {t('yearsN', { count: c.years })}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-sm font-bold ${STATUS_BADGE[st]}`} data-status={st}>{t(`st_${st}`)}</span>
      </header>
      <ResultBanner ns="contract" result={sp.result} />
      <p className="rounded-card bg-surface p-4 text-sm" data-next-step>{t(`next_${st}`)}</p>
      {under18 ? (
        <p className="rounded-card bg-gold p-4 text-sm font-semibold text-ink-950" data-minor-flag>
          {c.is_minor && c.guardian_signed_at ? t('minorSignedBy', { name: c.guardian_signed_name ?? '', relation: relationLabel(trel, c.guardian_relation).toLowerCase() }) : t('minorAdmin')}
        </p>
      ) : null}

      {c.status === 'draft' ? (
        <section className="rounded-card border border-line bg-raised p-6" aria-labelledby="edit-h">
          <h2 id="edit-h" className="font-display text-xl font-extrabold">{t('editDraft')}</h2>
          {blanks ? (
            <div role="alert" className="mt-2 rounded-card bg-danger/10 p-4 text-danger" data-blanks>
              <p className="font-semibold">{t('blanksLeft')}</p>
              <ul className="mt-2 grid gap-2 text-sm">
                {missing.map((b) => (
                  <li key={b.text} className="rounded-control bg-raised p-3 text-fg" data-blank={b.fix}>
                    <span className="block font-semibold">{t(`fix_${b.fix}`)}</span>
                    <span className="mt-0.5 block text-muted" lang="en" dir="ltr">[[{b.text}]]</span>
                    {fixHref[b.fix] ? <a href={fixHref[b.fix]!} className="mt-1 inline-block font-semibold text-pitch underline underline-offset-2">{t(`fixGo_${b.fix}` as 'fixGo_fees')}</a> : null}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-sm text-fg">{t('blanksThenRefill')}</p>
            </div>
          ) : null}
          <form action={saveContract} className="mt-3 grid gap-3 sm:grid-cols-3">
            <input type="hidden" name="id" value={c.id} />
            <label className="grid gap-1 text-sm font-semibold sm:col-span-3">{t('contractTitle')}<input name="title" required minLength={3} maxLength={160} defaultValue={c.title} className={input} /></label>
            <label className="grid gap-1 text-sm font-semibold">{t('duration')}
              <select name="years" defaultValue={String(c.years)} className={input}>{[1, 2, 3].map((y) => <option key={y} value={y}>{t('yearsN', { count: y })}</option>)}</select></label>
            <label className="grid gap-1 text-sm font-semibold">{t('startsOn')}<input name="starts_on" type="date" required defaultValue={c.starts_on} className={input} /></label>
            <label className="grid gap-1 text-sm font-semibold">{t('endsOn')}<input name="ends_on" type="date" required defaultValue={c.ends_on} className={input} /></label>
            <label className="grid gap-1 text-sm font-semibold sm:col-span-3">{t('contractText')}
              <textarea name="body" required minLength={50} maxLength={40000} rows={24} defaultValue={c.body} lang="en" dir="ltr" className="rounded-control border border-line bg-raised p-3 font-mono text-sm" />
              <span className="text-xs font-normal text-muted">{t('textHint')}</span></label>
            <button className="min-h-11 rounded-full border-2 border-fg px-6 font-display font-bold hover:bg-fg hover:text-raised sm:justify-self-start">{t('saveDraft')}</button>
          </form>
          <div className="mt-5 flex flex-wrap items-end gap-3 border-t border-line pt-5">
            {blanks ? null : <Step op="send" label={t('send')} confirm={t('sendNote')} />}
            <Step op="refill" label={t('refill')} confirm={t('refillNote')} tone="secondary" />
            <Step op="delete" label={t('deleteDraft')} tone="danger" />
          </div>
        </section>
      ) : (
        <section className="rounded-card border border-line bg-raised p-6" aria-labelledby="text-h">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="text-h" className="font-display text-xl font-extrabold">{t('contractText')}</h2>
            <a href={`/contracts/${c.id}`} target="_blank" rel="noopener" data-contract-pdf className="inline-flex min-h-11 items-center rounded-full border border-line px-5 font-semibold hover:border-accent">{t('pdf')}</a>
          </div>
          <div className="mt-3"><ConductText body={c.body} /></div>
        </section>
      )}

      {c.status !== 'draft' ? <ContractSignatures c={c} /> : null}

      {c.status === 'player_signed' ? (
        <section id="countersign" className="grid scroll-mt-20 gap-3 rounded-card border-2 border-accent bg-raised p-6" data-countersign-preview>
          <h2 className="font-display text-xl font-extrabold">{t('countersign')}</h2>
          <div className="rounded-card bg-surface p-4 sm:max-w-md">
            <p className="text-xs font-bold uppercase tracking-widest text-muted">{t('sigPreviewClub')}</p>
            <SignatureMark name={signer || null} placeholder="–" />
            <p className="mt-2 font-display font-extrabold" data-signer><bdi>{signer || t('sigClub')}</bdi></p>
            {settings.signatory_title ? <p className="text-sm text-muted" data-signer-title><bdi>{settings.signatory_title}</bdi></p> : null}
          </div>
          <p className="text-sm text-muted" data-signer-note>
            {settings.signatory_name ? t('signatoryFromSettings') : t('signatoryYou')}{' '}
            <a href="/admin/contracts#auto-h" className="font-semibold text-pitch underline underline-offset-2">{t('signatoryChange')}</a>
          </p>
          {guardianMissing ? <p role="alert" className="font-semibold text-danger">{t('minorWaiting')}</p> : <Step op="countersign" label={t('countersign')} />}
        </section>
      ) : null}
      {c.status === 'sent' || c.status === 'player_signed' ? <Step op="cancel" label={t('cancel')} tone="danger" /> : null}
      {c.status === 'active' ? (
        <details className="rounded-card border border-line bg-raised p-6">
          <summary className="cursor-pointer font-semibold">{t('terminate')}</summary>
          <form action={contractStep} className="mt-3 grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-end">
            <input type="hidden" name="id" value={c.id} /><input type="hidden" name="op" value="terminate" />
            <label className="grid gap-1 text-sm font-semibold">{t('terminatedOn')}<input name="terminated_on" type="date" required min={c.starts_on} className={input} /></label>
            <label className="grid gap-1 text-sm font-semibold">{t('reason')}<input name="reason" required maxLength={500} className={input} /></label>
            <button className="min-h-11 rounded-full border-2 border-danger px-6 font-bold text-danger hover:bg-danger/10">{t('terminate')}</button>
          </form>
        </details>
      ) : null}
    </div>
  );
}
