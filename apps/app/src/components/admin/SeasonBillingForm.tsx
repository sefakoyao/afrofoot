'use client';

import { useMemo, useState } from 'react';

type Labels = Record<'from' | 'to' | 'fee' | 'feeHint' | 'description' | 'issue' | 'due' | 'dueHint' | 'players' | 'search' | 'all' | 'none' | 'create' | 'summary' | 'summaryNone' | 'hasTeam', string>;
const input = 'min-h-10 w-full rounded-control border border-line bg-raised px-3 font-normal';

/**
 * The "Bill a past season" form (migration 0063): months, monthly fee, dates and a player checklist with search, select
 * all / none, and a running total (players × months × fee) so the admin sees what will be invoiced before sending.
 */
export function SeasonBillingForm({ action, seasonId, defaults, players, labels, locale }: {
  action: (fd: FormData) => Promise<void>; seasonId: string; locale: string;
  defaults: { from: string; to: string; issue: string; due: string; description: string; fee: string };
  players: { id: string; name: string; inSeason: boolean; billed: boolean }[]; labels: Labels;
}) {
  const [from, setFrom] = useState(defaults.from), [to, setTo] = useState(defaults.to), [fee, setFee] = useState(defaults.fee);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Set<string>>(() => new Set(players.filter((p) => p.inSeason && !p.billed).map((p) => p.id)));
  const months = useMemo(() => {
    const [fy, fm] = from.split('-').map(Number), [ty, tm] = to.split('-').map(Number);
    if (!fy || !fm || !ty || !tm) return 0;
    const n = (ty - fy) * 12 + (tm - fm) + 1;
    return n > 0 ? n : 0;
  }, [from, to]);
  const cents = Math.round(Number(fee.replace(',', '.')) * 100) || 0;
  const money = new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' });
  const shown = players.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()));
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const fill = (s: string, v: Record<string, string | number>) => Object.entries(v).reduce((a, [k, x]) => a.replace(`{${k}}`, String(x)), s);

  return (
    <form action={action} className="mt-4 grid gap-4" data-season-billing>
      <input type="hidden" name="season_id" value={seasonId} />
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1 text-sm font-semibold">{labels.from}<input type="month" name="from" required value={from} onChange={(e) => setFrom(e.target.value)} className={input} /></label>
        <label className="grid gap-1 text-sm font-semibold">{labels.to}<input type="month" name="to" required value={to} min={from} onChange={(e) => setTo(e.target.value)} className={input} /></label>
        <label className="grid gap-1 text-sm font-semibold">{labels.fee}<input name="fee" required inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="20" className={input} />
          <span className="text-xs font-normal text-muted">{labels.feeHint}</span></label>
        <label className="grid gap-1 text-sm font-semibold">{labels.description}<input name="description" required minLength={3} maxLength={60} defaultValue={defaults.description} dir="auto" className={input} /></label>
        <label className="grid gap-1 text-sm font-semibold">{labels.issue}<input type="date" name="issue" required defaultValue={defaults.issue} max={defaults.issue} className={input} /></label>
        <label className="grid gap-1 text-sm font-semibold">{labels.due}<input type="date" name="due" required defaultValue={defaults.due} className={input} />
          <span className="text-xs font-normal text-muted">{labels.dueHint}</span></label>
      </div>

      <fieldset className="grid gap-2 rounded-card border border-line p-3">
        <legend className="px-1 text-sm font-bold">{labels.players} ({picked.size}/{players.length})</legend>
        <div className="flex flex-wrap items-center gap-2">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={labels.search} aria-label={labels.search} className="min-h-9 min-w-0 flex-1 rounded-control border border-line bg-raised px-3 text-sm sm:max-w-xs" />
          <button type="button" onClick={() => setPicked(new Set([...picked, ...shown.map((p) => p.id)]))} className="min-h-9 rounded-full border border-line px-3 text-sm font-semibold hover:border-accent" data-select-all>{labels.all}</button>
          <button type="button" onClick={() => setPicked(new Set([...picked].filter((id) => !shown.some((p) => p.id === id))))} className="min-h-9 rounded-full border border-line px-3 text-sm font-semibold hover:border-accent">{labels.none}</button>
        </div>
        <ul className="grid max-h-72 gap-1 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
          {players.map((p) => (
            <li key={p.id} hidden={!shown.includes(p)}>
              <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-control px-2 hover:bg-surface">
                <input type="checkbox" name="players" value={p.id} checked={picked.has(p.id)} onChange={() => toggle(p.id)} className="size-5 accent-accent" />
                <bdi className="truncate">{p.name}</bdi>
                {p.billed ? <span className="ms-auto shrink-0 rounded-full bg-accent/15 px-2 text-xs font-bold text-pitch">✓</span> : p.inSeason ? <span className="ms-auto shrink-0 text-xs text-muted">{labels.hasTeam}</span> : null}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <p className={`rounded-card p-3 font-semibold ${picked.size && months && cents ? 'bg-gold text-ink-950' : 'bg-surface text-muted'}`} role="status" data-billing-summary>
        {picked.size && months && cents
          ? fill(labels.summary, { players: picked.size, months, fee: money.format(cents / 100), each: money.format((cents * months) / 100), total: money.format((cents * months * picked.size) / 100) })
          : labels.summaryNone}
      </p>
      <button disabled={!picked.size || !months || !cents} className="min-h-11 justify-self-start rounded-full bg-accent px-6 font-display font-bold text-on-accent hover:brightness-110 disabled:opacity-40">{labels.create}</button>
    </form>
  );
}
