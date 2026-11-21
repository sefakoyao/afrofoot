import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ConductText } from '@/components/ConductText';
import { ContractSignatures } from '@/components/ContractSignatures';
import { requireArea } from '@/lib/auth';
import { contractColumns, readContracts, STATUS_BADGE, shownStatus, type Contract } from '@/lib/contracts';
import { dateFormats } from '@/lib/format';
import { getSupabase } from '@/lib/supabase/server';
import { helsinkiToday } from '@/lib/time';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('contract'))('myContract') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A player's contract, read-only for their coach (RLS contract_coach_read, migration 0031: own team, never drafts). */
export default async function CoachContractPage({ params }: { params: Promise<{ id: string }> }) {
  await requireArea('coach');
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [t, fmt, supabase] = await Promise.all([getTranslations('contract'), dateFormats(), getSupabase()]);
  if (!supabase) notFound();
  const { data } = await readContracts((_, minor) => supabase.from('player_contracts').select(`${contractColumns(minor)}, players!inner(first_name, last_name)`).eq('id', id).maybeSingle());
  if (!data) notFound();
  const c = data as unknown as Contract & { players: { first_name: string; last_name: string } };
  const st = shownStatus(c, helsinkiToday());
  const d = (iso: string) => fmt.date.format(new Date(`${iso}T12:00:00Z`));
  return (
    <div className="mx-auto grid max-w-3xl grid-cols-[minmax(0,1fr)] gap-5">
      <Link href="/coach" className="text-sm font-semibold text-pitch underline underline-offset-2">← {t('backCoach')}</Link>
      <article className="rounded-card border border-line bg-raised p-6" aria-labelledby="ct-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted"><bdi>{c.players.first_name} {c.players.last_name}</bdi></p>
            <h1 id="ct-title" className="font-display text-2xl font-extrabold">{c.title}</h1>
            <p className="text-sm text-muted">{d(c.starts_on)} – {d(c.ends_on)} · {t('yearsN', { count: c.years })}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-sm font-bold ${STATUS_BADGE[st]}`} data-status={st}>{t(`st_${st}`)}</span>
        </div>
        <p className="mt-3 rounded-card bg-surface p-3 text-sm">{t('coachNote')} <a href={`/contracts/${c.id}`} target="_blank" rel="noopener" data-contract-pdf className="font-semibold text-pitch underline">{t('pdf')}</a></p>
        <div className="mt-4"><ConductText body={c.body} /></div>
      </article>
      <ContractSignatures c={c} />
    </div>
  );
}
