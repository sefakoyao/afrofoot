import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { readContracts, STATUS_BADGE, shownStatus, type ContractStatus } from '@/lib/contracts';
import { dateFormats } from '@/lib/format';
import { coachScope } from '@/lib/staff';
import { getSupabase } from '@/lib/supabase/server';
import { helsinkiToday } from '@/lib/time';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('perm'))('contractsTitle') };
}

type Row = { id: string; title: string; status: ContractStatus; starts_on: string; ends_on: string; is_minor?: boolean; player_id: string; players: { first_name: string; last_name: string } };

/**
 * Coach → Teams & events → Contracts (migration 0070, right "contracts"): the contracts of the players in the teams the
 * coach coaches, read only (RLS contract_coach_read: own teams, never drafts). Each opens the contract and its PDF.
 */
export default async function CoachContractsPage() {
  const scope = await coachScope();
  if (!scope.perms.has('contracts')) redirect('/coach');
  const [t, tk, fmt, supabase] = await Promise.all([getTranslations('perm'), getTranslations('contract'), dateFormats(), getSupabase()]);
  const { data } = supabase ? await readContracts((extra) => supabase.from('player_contracts').select(`id, title, status, starts_on, ends_on${extra ? ', is_minor' : ''}, player_id, players!inner(first_name, last_name)`).order('starts_on', { ascending: false }).limit(300)) : { data: [] };
  const rows = ((data ?? []) as unknown as Row[]).sort((a, b) => a.players.last_name.localeCompare(b.players.last_name));
  const today = helsinkiToday();
  const d = (iso: string) => fmt.date.format(new Date(`${iso}T12:00:00Z`));
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <header>
        <h1 className="font-display text-2xl font-extrabold">{t('contractsTitle')}</h1>
        <p className="mt-1 max-w-3xl text-muted">{t('contractsLead')}</p>
      </header>
      {rows.length === 0 ? <p className="rounded-card border border-line bg-raised p-6 text-muted">{t('contractsNone')}</p> : (
        <ul className="overflow-hidden rounded-card border border-line bg-raised" data-coach-contracts>
          {rows.map((c) => { const st = shownStatus(c, today); return (
            <li key={c.id} className="border-b border-line last:border-0">
              <Link href={`/coach/contracts/${c.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3.5 hover:bg-accent/5" data-contract={c.id}>
                <span className="grid min-w-0 flex-1 leading-tight">
                  <span className="font-bold"><bdi>{c.players.first_name} {c.players.last_name}</bdi>{c.is_minor ? <span className="ms-2 rounded-full bg-gold px-2 py-0.5 text-xs font-bold text-ink-950">{tk('under18')}</span> : null}</span>
                  <span className="text-sm text-muted">{c.title} · {d(c.starts_on)} – {d(c.ends_on)}</span>
                </span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_BADGE[st]}`}>{tk(`st_${st}`)}</span>
              </Link>
            </li>); })}
        </ul>
      )}
    </div>
  );
}
