import { getTranslations } from 'next-intl/server';
import { decideShirt } from '@/app/actions/shirts';
import { dateFormats, isolate } from '@/lib/format';
import type { ShirtRequest } from '@/lib/shirts';

/** Open shirt number requests with Approve / Decline (coach team page and Admin → Shirt numbers). */
export async function ShirtRequests({ requests, back, teamName }: { requests: ShirtRequest[]; back: string; teamName?: (id: string) => string }) {
  const [t, fmt] = await Promise.all([getTranslations('shirt'), dateFormats()]);
  if (!requests.length) return <p className="text-sm text-muted" data-no-requests>{t('noRequests')}</p>;
  const input = 'min-h-10 w-full rounded-control border border-line bg-raised px-3 text-sm';
  return (
    <ul className="grid gap-2" data-shirt-requests>
      {requests.map((r) => (
        <li key={r.id} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 rounded-card bg-surface p-3" data-shirt-request={r.number}>
          <span className="flex size-12 items-center justify-center rounded-control bg-ink-950 font-display text-lg font-black text-white tabular-nums" aria-hidden>{r.number}</span>
          <div className="min-w-0 text-sm">
            <p className="font-semibold">{t('asks', { name: isolate(`${r.players?.first_name ?? ''} ${r.players?.last_name ?? ''}`.trim()), number: r.number })}</p>
            <p className="text-muted">{teamName ? `${teamName(r.team_season_id)} · ` : ''}{fmt.dateTime.format(new Date(r.created_at))}{r.note ? <> · <bdi>{r.note}</bdi></> : null}</p>
          </div>
          <form action={decideShirt} className="col-span-2 flex flex-wrap items-center gap-2 sm:col-start-2 sm:col-span-1">
            <input type="hidden" name="request_id" value={r.id} /><input type="hidden" name="back" value={back} />
            <input name="note" maxLength={200} placeholder={t('decisionNote')} aria-label={t('decisionNote')} className={`${input} min-w-[10rem] flex-1`} />
            <button name="decision" value="approve" className="min-h-10 rounded-full bg-accent px-4 text-sm font-bold text-on-accent hover:brightness-110" data-approve>{t('approve')}</button>
            <button name="decision" value="decline" className="min-h-10 rounded-full border-2 border-danger px-4 text-sm font-bold text-danger hover:bg-danger/10" data-decline>{t('decline')}</button>
          </form>
        </li>
      ))}
    </ul>
  );
}
