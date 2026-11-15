'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { saveLineup } from '@/app/actions/match';
import type { Role, Slot } from '@/lib/match';

export interface LineupPlayer { id: string; name: string; shirt: number | null; role: Role | null; reply: 'pending' | 'yes' | 'no' | 'maybe' }
interface Props {
  matchId: string; back: string; opponent: string; locked: boolean;
  formations: { code: string; slots: Slot[] }[];
  roster: LineupPlayer[];
  initial: { formation: string; starters: Record<number, string>; subs: string[]; captain: string | null };
}

const REPLY_STYLE: Record<LineupPlayer['reply'], string> = { yes: 'bg-accent/20 text-pitch', no: 'bg-danger/15 text-danger', maybe: 'bg-line', pending: 'bg-line text-muted' };
const ROLE_ORDER: Role[] = ['GK', 'DF', 'MF', 'FW'];

/**
 * Lineup on a pitch: tap a position, then "Start" a player (or let Auto-fill do it from the players' replies), add a bench,
 * pick the captain. Checks warn about a missing goalkeeper, players who said they cannot come, and players out of position.
 * Saved in one step (save_lineup, migration 0031); the database locks the lineup once the match has kicked off.
 */
export function LineupBuilder({ matchId, back, opponent, locked, formations, roster, initial }: Props) {
  const t = useTranslations('match');
  const [formation, setFormation] = useState(initial.formation);
  const [starters, setStarters] = useState<Record<number, string>>(initial.starters);
  const [subs, setSubs] = useState<string[]>(initial.subs);
  const [captain, setCaptain] = useState<string | null>(initial.captain);
  const [selected, setSelected] = useState<number | null>(null);
  const [filter, setFilter] = useState<'all' | Role>('all');
  const [copied, setCopied] = useState(false);

  const slots = formations.find((f) => f.code === formation)?.slots ?? formations[0]?.slots ?? [];
  const byId = useMemo(() => new Map(roster.map((p) => [p.id, p])), [roster]);
  const inXI = new Set(Object.values(starters));
  const used = new Set([...inXI, ...subs]);
  const pool = roster.filter((p) => !used.has(p.id) && (filter === 'all' || p.role === filter))
    .sort((a, b) => (a.reply === 'no' ? 1 : 0) - (b.reply === 'no' ? 1 : 0) || ROLE_ORDER.indexOf(a.role ?? 'FW') - ROLE_ORDER.indexOf(b.role ?? 'FW') || a.name.localeCompare(b.name));
  const roleOfSlot = (n: number) => slots.find((s) => s.slot === n)?.role;

  const removeEverywhere = (id: string, s: Record<number, string>, b: string[]) => {
    const ns = Object.fromEntries(Object.entries(s).filter(([, v]) => v !== id)) as Record<number, string>;
    return [ns, b.filter((x) => x !== id)] as const;
  };
  const start = (id: string) => {
    const p = byId.get(id);
    const target = selected ?? slots.find((s) => !starters[s.slot] && s.role === p?.role)?.slot ?? slots.find((s) => !starters[s.slot])?.slot;
    if (!target) return;
    const [ns, nb] = removeEverywhere(id, starters, subs);
    setStarters({ ...ns, [target]: id }); setSubs(nb); setSelected(null);
  };
  const bench = (id: string) => { if (subs.length >= 12) return; const [ns, nb] = removeEverywhere(id, starters, subs); setStarters(ns); setSubs([...nb, id]); };
  const remove = (id: string) => { const [ns, nb] = removeEverywhere(id, starters, subs); setStarters(ns); setSubs(nb); if (captain === id) setCaptain(null); };
  const tapSlot = (n: number) => {
    if (locked) return;
    if (selected !== null && selected !== n) { // swap two positions
      const a = starters[selected], b = starters[n]; const ns = { ...starters };
      if (b) ns[selected] = b; else delete ns[selected];
      if (a) ns[n] = a; else delete ns[n];
      setStarters(ns); setSelected(null); return;
    }
    setSelected(selected === n ? null : n);
  };
  const autoFill = () => {
    const ns = { ...starters }; const taken = new Set([...Object.values(ns), ...subs]);
    const rank = (p: LineupPlayer) => (p.reply === 'yes' ? 0 : p.reply === 'maybe' ? 1 : 2);
    const candidates = roster.filter((p) => p.reply !== 'no').sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
    // first every position with a player of that position, then fill the rest with outfield players
    for (const exact of [true, false]) {
      for (const s of slots) {
        if (ns[s.slot]) continue;
        const p = exact ? candidates.find((c) => !taken.has(c.id) && c.role === s.role)
          : s.role === 'GK' ? undefined : candidates.find((c) => !taken.has(c.id) && c.role !== 'GK');
        if (p) { ns[s.slot] = p.id; taken.add(p.id); }
      }
    }
    const nb = [...subs, ...candidates.filter((c) => !taken.has(c.id) && c.reply === 'yes').map((c) => c.id)].slice(0, 9);
    setStarters(ns); setSubs(nb);
  };
  const clear = () => { setStarters({}); setSubs([]); setCaptain(null); setSelected(null); };

  // checks
  const count = Object.keys(starters).length;
  const gk = starters[1] ? byId.get(starters[1]) : undefined;
  const saidNo = [...used].map((id) => byId.get(id)).filter((p): p is LineupPlayer => !!p && p.reply === 'no');
  const outOfPosition = slots.filter((s) => { const p = starters[s.slot] ? byId.get(starters[s.slot]!) : undefined; return !!p?.role && p.role !== s.role; }).length;
  const checks: { ok: boolean; text: string; key: string }[] = [
    { key: 'xi', ok: count === 11, text: t('checkXI', { count }) },
    { key: 'gk', ok: !!gk && gk.role === 'GK', text: gk ? (gk.role === 'GK' ? t('checkGk') : t('checkGkNot', { name: gk.name })) : t('checkNoGk') },
    { key: 'no', ok: saidNo.length === 0, text: saidNo.length ? t('checkSaidNo', { names: saidNo.map((p) => p.name).join(', ') }) : t('checkReplies') },
    { key: 'pos', ok: outOfPosition === 0, text: outOfPosition ? t('checkOutOfPosition', { count: outOfPosition }) : t('checkPositions') },
    { key: 'cap', ok: !!captain, text: captain ? t('checkCaptain', { name: byId.get(captain)?.name ?? '' }) : t('checkNoCaptain') },
    { key: 'bench', ok: subs.length > 0, text: t('checkBench', { count: subs.length }) },
  ];

  const asText = () => {
    const line = (id: string) => { const p = byId.get(id); return p ? `${p.shirt ? `#${p.shirt} ` : ''}${p.name}${captain === id ? ' (C)' : ''}` : ''; };
    const xi = ROLE_ORDER.map((r) => slots.filter((s) => s.role === r && starters[s.slot]).map((s) => line(starters[s.slot]!)).join(', ')).filter(Boolean);
    return `${t('textTitle', { opponent })} (${formation})\n${xi.join('\n')}\n${t('bench')}: ${subs.map(line).join(', ') || '–'}`;
  };

  const Chip = ({ p }: { p: LineupPlayer }) => <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${REPLY_STYLE[p.reply]}`}>{t(`reply_${p.reply}`)}</span>;

  return (
    <div className="grid gap-4" data-lineup>
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm font-semibold">{t('formation')}
          <select value={formation} onChange={(e) => setFormation(e.target.value)} disabled={locked} className="min-h-11 rounded-control border border-line bg-raised px-3" name="formation_pick">
            {formations.map((f) => <option key={f.code} value={f.code}>{f.code}</option>)}
          </select>
        </label>
        <button type="button" onClick={autoFill} disabled={locked} data-autofill className="min-h-11 rounded-full border-2 border-fg px-4 font-bold hover:bg-fg hover:text-raised disabled:opacity-50">{t('autoFill')}</button>
        <button type="button" onClick={clear} disabled={locked} className="min-h-11 rounded-full border border-line px-4 font-semibold hover:border-danger disabled:opacity-50">{t('clear')}</button>
        <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(asText()); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ } }}
          data-copy-lineup className="min-h-11 rounded-full border border-line px-4 font-semibold hover:border-accent"><span aria-live="polite">{copied ? t('copied') : t('copyText')}</span></button>
      </div>
      {locked ? <p role="status" className="rounded-card bg-surface p-3 text-sm">{t('lineupLockedNote')}</p> : <p className="text-sm text-muted">{t('lineupHint')}</p>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        {/* pitch: y 0 = opponent goal (top), 100 = own goal (bottom) */}
        <div className="relative mx-auto aspect-[68/100] w-full max-w-md overflow-hidden rounded-card border-4 border-white/70 shadow-inner"
          style={{ background: 'repeating-linear-gradient(0deg, #2f8f22 0 10%, #349a26 10% 20%)' }} dir="ltr" aria-label={t('pitch')} role="group">
          <div className="pointer-events-none absolute inset-x-0 top-1/2 h-0.5 bg-white/60" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 size-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/60" />
          <div className="pointer-events-none absolute bottom-0 left-1/2 h-[16%] w-[56%] -translate-x-1/2 border-2 border-b-0 border-white/60" />
          <div className="pointer-events-none absolute left-1/2 top-0 h-[16%] w-[56%] -translate-x-1/2 border-2 border-t-0 border-white/60" />
          {slots.map((s) => {
            const p = starters[s.slot] ? byId.get(starters[s.slot]!) : undefined;
            const sel = selected === s.slot;
            return (
              <button key={s.slot} type="button" onClick={() => tapSlot(s.slot)} data-slot={s.slot} data-filled={p ? p.id : ''}
                aria-pressed={sel} aria-label={p ? `${t(`role_${s.role}`)}: ${p.name}` : `${t(`role_${s.role}`)}: ${t('empty')}`}
                className="absolute flex w-20 -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5 focus:outline-none" style={{ left: `${s.x}%`, top: `${s.y}%` }}>
                <span className={`flex size-11 items-center justify-center rounded-full border-2 font-display text-sm font-black shadow ${p ? (s.role === 'GK' ? 'border-white bg-ink-950 text-white' : 'border-white bg-white text-ink-950') : 'border-dashed border-white/80 bg-white/10 text-white'} ${sel ? 'ring-4 ring-accent' : ''}`}>
                  {p ? (p.shirt ?? '•') : s.role}{p && captain === p.id ? <sup className="ms-0.5 text-[10px]">C</sup> : null}
                </span>
                <span className="max-w-full truncate rounded bg-black/55 px-1 text-[11px] font-semibold text-white">{p ? p.name.split(' ').slice(-1)[0] : t(`role_${s.role}`)}</span>
              </button>
            );
          })}
        </div>

        <div className="grid content-start gap-4">
          <ul className="grid gap-1.5" aria-label={t('checks')} data-checks>
            {checks.map((c) => <li key={c.key} data-check={c.key} data-ok={c.ok} className={`flex gap-2 text-sm ${c.ok ? 'text-pitch' : 'text-danger'}`}><span aria-hidden>{c.ok ? '✓' : '!'}</span><span>{c.text}</span></li>)}
          </ul>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted">{t('bench')} ({subs.length}/12)</h3>
            {subs.length === 0 ? <p className="mt-1 text-sm text-muted">–</p> : (
              <ul className="mt-1 grid gap-1">
                {subs.map((id) => { const p = byId.get(id); return p ? (
                  <li key={id} data-bench={id} className="flex flex-wrap items-center justify-between gap-2 rounded-card bg-surface px-3 py-1.5 text-sm">
                    <span><span className="text-muted" dir="ltr">{p.shirt ? `#${p.shirt} ` : ''}</span><bdi className="font-semibold">{p.name}</bdi> <Chip p={p} /></span>
                    {locked ? null : <span className="flex gap-1">
                      <button type="button" onClick={() => start(id)} className="min-h-9 rounded-full border border-line px-3 text-xs font-bold hover:border-accent">{t('start')}</button>
                      <button type="button" onClick={() => remove(id)} aria-label={`${t('remove')}: ${p.name}`} className="min-h-9 rounded-full border border-line px-3 text-xs font-bold hover:border-danger">✕</button>
                    </span>}
                  </li>) : null; })}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-xs font-bold uppercase tracking-widest text-muted">{t('startingXI')} ({count}/11)</h3>
        <ul className="mt-1 grid gap-1 sm:grid-cols-2">
          {slots.filter((s) => starters[s.slot]).map((s) => { const p = byId.get(starters[s.slot]!)!; return (
            <li key={s.slot} data-starter={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-card bg-surface px-3 py-1.5 text-sm">
              <span><span className="me-1 inline-block w-7 font-bold text-muted">{t(`role_${s.role}`)}</span><bdi className="font-semibold">{p.name}</bdi> <Chip p={p} /></span>
              {locked ? null : <span className="flex gap-1">
                <button type="button" onClick={() => setCaptain(captain === p.id ? null : p.id)} aria-pressed={captain === p.id} aria-label={`${t('captain')}: ${p.name}`}
                  className={`min-h-9 rounded-full px-3 text-xs font-bold ${captain === p.id ? 'bg-accent text-on-accent' : 'border border-line hover:border-accent'}`}>C</button>
                <button type="button" onClick={() => bench(p.id)} className="min-h-9 rounded-full border border-line px-3 text-xs font-bold hover:border-accent">{t('toBench')}</button>
                <button type="button" onClick={() => remove(p.id)} aria-label={`${t('remove')}: ${p.name}`} className="min-h-9 rounded-full border border-line px-3 text-xs font-bold hover:border-danger">✕</button>
              </span>}
            </li>); })}
        </ul>
      </div>

      {locked ? null : (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted">{t('available')} ({pool.length})</h3>
            <div className="flex flex-wrap gap-1" role="group" aria-label={t('filterRole')}>
              {(['all', ...ROLE_ORDER] as const).map((r) => (
                <button key={r} type="button" onClick={() => setFilter(r)} aria-pressed={filter === r}
                  className={`min-h-9 rounded-full px-3 text-xs font-bold ${filter === r ? 'bg-fg text-raised' : 'border border-line'}`}>{r === 'all' ? t('all') : t(`role_${r}`)}</button>
              ))}
            </div>
          </div>
          {selected !== null ? <p className="mt-1 text-sm font-semibold text-pitch" role="status">{t('pickFor', { role: t(`role_${roleOfSlot(selected) ?? 'MF'}`) })}</p> : null}
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {pool.map((p) => (
              <li key={p.id} data-pool={p.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-card border px-3 py-1.5 text-sm ${p.reply === 'no' ? 'border-danger/30 opacity-70' : 'border-line'}`}>
                <span><span className="text-muted" dir="ltr">{p.shirt ? `#${p.shirt} ` : ''}</span><bdi className="font-semibold">{p.name}</bdi> <span className="text-xs text-muted">{p.role ? t(`role_${p.role}`) : ''}</span> <Chip p={p} /></span>
                <span className="flex gap-1">
                  <button type="button" onClick={() => start(p.id)} disabled={!selected && count >= 11} className="min-h-9 rounded-full bg-accent px-3 text-xs font-bold text-on-accent disabled:opacity-50">{t('start')}</button>
                  <button type="button" onClick={() => bench(p.id)} disabled={subs.length >= 12} className="min-h-9 rounded-full border border-line px-3 text-xs font-bold hover:border-accent disabled:opacity-50">{t('toBench')}</button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {locked ? null : (
        <form action={saveLineup} className="sticky bottom-2 flex flex-wrap items-center gap-3 rounded-card bg-raised/95 p-2 shadow-lg">
          <input type="hidden" name="match_id" value={matchId} /><input type="hidden" name="back" value={back} />
          <input type="hidden" name="formation" value={formation} />
          <input type="hidden" name="starters" value={JSON.stringify(Object.entries(starters).map(([slot, player]) => ({ slot: Number(slot), player })))} />
          <input type="hidden" name="subs" value={JSON.stringify(subs)} /><input type="hidden" name="captain" value={captain ?? ''} />
          <button className="min-h-12 flex-1 rounded-full bg-accent px-6 font-display font-bold text-on-accent hover:brightness-110">{t('saveLineup')}</button>
        </form>
      )}
    </div>
  );
}
