import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { declineContract, signContract } from '@/app/actions/contracts';
import { SignaturePreview } from '@/components/SignaturePreview';
import { ConductText } from '@/components/ConductText';
import { ContractSignatures } from '@/components/ContractSignatures';
import { ResultBanner } from '@/components/ResultBanner';
import { requireArea } from '@/lib/auth';
import { contractColumns, readContracts, STATUS_BADGE, shownStatus, type Contract } from '@/lib/contracts';
import { dateFormats } from '@/lib/format';
import { getSupabase } from '@/lib/supabase/server';
import { helsinkiToday } from '@/lib/time';
import { relationLabel } from '@/lib/relations';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('contract'))('myContract') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The player reads their contract and signs it with their name, or declines it. RLS returns only their own, never drafts. */
export default async function MyContractPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const member = await requireArea('me');
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const [t, trel, fmt, supabase] = await Promise.all([getTranslations('contract'), getTranslations('relation'), dateFormats(), getSupabase()]);
  if (!supabase) notFound();
  const { data } = await readContracts((_, minor) => supabase.from('player_contracts').select(contractColumns(minor)).eq('id', id).maybeSingle());
  if (!data) notFound();
  const c = data as unknown as Contract;
  const st = shownStatus(c, helsinkiToday());
  const d = (iso: string) => fmt.date.format(new Date(`${iso}T12:00:00Z`));
  const fullName = `${member.firstName} ${member.lastName}`.trim();
  // 0068: under 18 → a parent or guardian signs too (true / false / null = birth date not known: the player answers)
  const minor = c.status === 'sent' ? ((await supabase.rpc('my_minor_status')).data as boolean | null) : false;
  // the saved birth date behind "under 18", so a player can spot a wrong one and ask an admin to correct it
  const birth = minor ? ((await supabase.from('players').select('date_of_birth').eq('id', c.player_id).maybeSingle()).data?.date_of_birth as string | null | undefined) ?? null : null;
  // prefill from the emergency contact when it is a parent or guardian
  const { data: priv } = c.status === 'sent' && minor !== false
    ? await supabase.from('player_private').select('emergency_name, emergency_phone, emergency_relation').eq('player_id', c.player_id).maybeSingle()
    : { data: null };
  const parentLike = priv?.emergency_relation && ['mother', 'father', 'guardian'].includes(priv.emergency_relation);
  const g = { name: parentLike ? priv!.emergency_name ?? '' : '', phone: parentLike ? priv!.emergency_phone ?? '' : '', relation: parentLike ? priv!.emergency_relation! : '' };
  const input = 'min-h-11 rounded-control border border-line bg-raised px-3 font-normal';

  return (
    <div className="mx-auto grid max-w-3xl grid-cols-[minmax(0,1fr)] gap-5">
      <Link href="/me/membership#contract" className="text-sm font-semibold text-pitch underline underline-offset-2">← {t('back')}</Link>
      <ResultBanner ns="contract" result={sp.result} />
      <article className="rounded-card border border-line bg-raised p-6" aria-labelledby="ct-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 id="ct-title" className="font-display text-2xl font-extrabold">{c.title}</h1>
            <p className="text-sm text-muted">{d(c.starts_on)} – {d(c.ends_on)} · {t('yearsN', { count: c.years })}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-sm font-bold ${STATUS_BADGE[st]}`} data-status={st}>{t(`st_${st}`)}</span>
        </div>
        <p className="mt-3 rounded-card bg-surface p-3 text-sm">{t('englishNote')} <a href={`/contracts/${c.id}`} target="_blank" rel="noopener" data-contract-pdf className="font-semibold text-pitch underline">{t('pdf')}</a></p>
        <div className="mt-4"><ConductText body={c.body} /></div>
      </article>

      {c.status === 'sent' ? (
        <section className="rounded-card border-2 border-accent bg-raised p-6" aria-labelledby="sign-h" id="sign">
          <h2 id="sign-h" className="font-display text-xl font-extrabold">{t('signTitle')}</h2>
          {minor ? <div className="mt-2 rounded-card bg-gold p-3 text-sm text-ink-950" data-minor-note><p className="font-semibold">{t('minorNote')}</p>
            {birth ? <p className="mt-1" data-minor-birth>{t('minorBirth', { date: fmt.date.format(new Date(`${birth}T12:00:00Z`)) })}</p> : null}</div> : null}
          <form action={signContract} className="mt-3 grid gap-4">
            <input type="hidden" name="id" value={c.id} />
            <SignaturePreview label={t('typeName')} hint={t('typeNameHint', { name: fullName || '–' })} previewLabel={t('sigPreview')} placeholder={t('sigPreviewEmpty')} />
            {minor === null ? (
              <fieldset className="grid gap-2 rounded-card bg-surface p-4" data-minor-question>
                <legend className="font-semibold">{t('minorQuestion')}</legend>
                <label className="flex items-center gap-2"><input type="radio" name="minor" value="no" required className="size-5 accent-[rgb(var(--accent))]" />{t('minorNo')}</label>
                <label className="flex items-center gap-2"><input type="radio" name="minor" value="yes" className="size-5 accent-[rgb(var(--accent))]" />{t('minorYes')}</label>
              </fieldset>
            ) : null}
            {minor !== false ? (
              // shown at once for a known minor; without a birth date only after answering "under 18"
              <fieldset className={`gap-4 rounded-card border-2 border-gold bg-surface p-4 ${minor ? 'grid' : 'hidden [form:has(input[name=minor][value=yes]:checked)_&]:grid'}`} data-guardian>
                <legend className="rounded-full bg-gold px-3 py-1 text-sm font-bold text-ink-950">{t('guardianTitle')}</legend>
                <p className="text-sm">{t('guardianLead')}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm font-semibold">{t('guardianName')}<input name="guardian_name" required={!!minor} minLength={2} maxLength={120} defaultValue={g.name} autoComplete="off" className={input} /></label>
                  <label className="grid gap-1 text-sm font-semibold">{t('guardianRelation')}
                    <select name="guardian_relation" required={!!minor} defaultValue={g.relation} className={input}>
                      <option value="" disabled>{t('choose')}</option>
                      {(['mother', 'father', 'guardian'] as const).map((r) => <option key={r} value={r}>{relationLabel(trel, r)}</option>)}
                    </select></label>
                  <label className="grid gap-1 text-sm font-semibold">{t('guardianPhone')}<input name="guardian_phone" type="tel" inputMode="tel" dir="ltr" required={!!minor} maxLength={30} defaultValue={g.phone} placeholder="+358 40 123 4567" className={input} />
                    <span className="text-xs font-normal text-muted">{t('guardianPhoneHint')}</span></label>
                  <label className="grid gap-1 text-sm font-semibold">{t('guardianEmail')}<input name="guardian_email" type="email" maxLength={200} dir="ltr" className={input} /></label>
                </div>
                <SignaturePreview field="guardian_sign" autoComplete="off" required={!!minor} label={t('guardianSign')} hint={t('guardianSignHint')} previewLabel={t('guardianPreview')} placeholder={t('sigPreviewEmpty')} />
              </fieldset>
            ) : null}
            <label className="flex items-start gap-3">
              <input type="checkbox" name="agree" required className="mt-1 size-6 shrink-0 accent-[rgb(var(--accent))]" />
              <span>{minor ? t('signCheckboxMinor') : t('signCheckbox')}</span>
            </label>
            <button className="min-h-12 rounded-full bg-accent px-6 font-display font-bold text-on-accent hover:brightness-110 sm:justify-self-start">{t('signButton')}</button>
            <p className="text-xs text-muted">{t('signRecord')}</p>
          </form>
          <details className="mt-5 border-t border-line pt-4">
            <summary className="cursor-pointer font-semibold">{t('declineTitle')}</summary>
            <form action={declineContract} className="mt-3 grid gap-3">
              <input type="hidden" name="id" value={c.id} />
              <label className="grid gap-1 text-sm font-semibold">{t('declineReason')}<textarea name="reason" maxLength={500} rows={3} className="rounded-control border border-line bg-raised p-3" /></label>
              <button className="min-h-11 rounded-full border-2 border-danger px-6 font-bold text-danger hover:bg-danger/10 sm:justify-self-start">{t('declineButton')}</button>
            </form>
          </details>
        </section>
      ) : null}

      <ContractSignatures c={c} />
    </div>
  );
}
