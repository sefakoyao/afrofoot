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
import { CONTRACT_COLUMNS, STATUS_BADGE, shownStatus, type Contract } from '@/lib/contracts';
import { dateFormats } from '@/lib/format';
import { getSupabase } from '@/lib/supabase/server';
import { helsinkiToday } from '@/lib/time';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('contract'))('myContract') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The player reads their contract and signs it with their name, or declines it. RLS returns only their own, never drafts. */
export default async function MyContractPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const member = await requireArea('me');
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const [t, fmt, supabase] = await Promise.all([getTranslations('contract'), dateFormats(), getSupabase()]);
  if (!supabase) notFound();
  const { data } = await supabase.from('player_contracts').select(CONTRACT_COLUMNS).eq('id', id).maybeSingle();
  if (!data) notFound();
  const c = data as Contract;
  const st = shownStatus(c, helsinkiToday());
  const d = (iso: string) => fmt.date.format(new Date(`${iso}T12:00:00Z`));
  const fullName = `${member.firstName} ${member.lastName}`.trim();

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
          <form action={signContract} className="mt-3 grid gap-4">
            <input type="hidden" name="id" value={c.id} />
            <SignaturePreview label={t('typeName')} hint={t('typeNameHint', { name: fullName || '–' })} previewLabel={t('sigPreview')} placeholder={t('sigPreviewEmpty')} />
            <label className="flex items-start gap-3">
              <input type="checkbox" name="agree" required className="mt-1 size-6 shrink-0 accent-[rgb(var(--accent))]" />
              <span>{t('signCheckbox')}</span>
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
