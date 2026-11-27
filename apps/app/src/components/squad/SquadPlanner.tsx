'use client';

import { useActionState, useMemo, useState, type DragEvent } from 'react';
import { useTranslations } from 'next-intl';
import { analysePlan, saveSquadPlan, type AnalysisState, type SaveState } from '@/app/actions/squad';
import type { Formation, Line, Plan, PoolEntry, Status } from '@/lib/squad-plan';
import { fit, gaps, outlookOf, suggest, warnings, type Outlook } from '@/lib/squad-score';

const DEPTHS = 3;
const OUTLOOK_STYLE: Record<Outlook, string> = {
  confirmed: 'bg-accent text-on-accent', likely: 'bg-gold text-ink-950', unsure: 'bg-line text-fg', leaving: 'bg-danger text-white', target: 'bg-ink-950 text-white',
};
const DOT: Record<Outlook, string> = { confirmed: 'bg-accent', likely: 'bg-gold', unsure: 'bg-muted', leaving: 'bg-danger', target: 'bg-ink-950 ring-2 ring-white' };
const LEVEL: Record<'ok' | 'warn' | 'gap', string> = { ok: 'bg-accent/15 text-pitch', warn: 'bg-gold text-ink-950', gap: 'bg-danger/10 text-danger' };
const surname = (n: string) => n.split(' ').slice(-1)[0] ?? n;
type Board = Record<number, (string | null)[]>;

/**
 * Squad planner (migration 0076): the player pool with each player's outlook for the season, a pitch where every place has
 * a starter and two back-ups (drag a player, or tap a player and then a place), the gaps per line, warnings, the best
 * candidates for the chosen place with the reasons, and the assistant's analysis. Saved in one step.
 */
export function SquadPlanner({ teamId, teamName, year, formations, pool, plan, canAnalyse }: {
  teamId: string; teamName: string; year: number; formations: Formation[]; pool: PoolEntry[]; plan: Plan | null; canAnalyse: boolean;
}) {
  const t = useTranslations('squad');
  const byKey = useMemo(() => new Map(pool.map((p) => [p.key, p])), [pool]);
  const [formation, setFormation] = useState(plan?.formation ?? (formations.find((f) => f.code === '4-3-3') ?? formations[0])!.code);
  const [board, setBoard] = useState<Board>(() => {
    const b: Board = {};
    for (const s of plan?.slots ?? []) if (byKey.has(s.key)) (b[s.slot] ??= [null, null, null])[s.depth - 1] = s.key;
    return b;
  });
  const [statuses, setStatuses] = useState<Record<string, { status: Status; note: string }>>(plan?.statuses ?? {});
  const [notes, setNotes] = useState(plan?.notes ?? '');
  const [picked, setPicked] = useState<string | null>(null);        // a pool player chosen to place by tapping
  const [place, setPlace] = useState<number>(1);                     // the place whose suggestions are shown
  const [filter, setFilter] = useState<{ line: Line | ''; outlook: Outlook | ''; q: string; scope: 'team' | 'all' }>({ line: '', outlook: '', q: '', scope: 'team' });
  const [dirty, setDirty] = useState(false);
  const [saved, save, saving] = useActionState<SaveState, FormData>(saveSquadPlan, { status: 'idle' });
  const [ai, analyse, analysing] = useActionState<AnalysisState, FormData>(analysePlan, { status: 'idle' });

  const form = formations.find((f) => f.code === formation) ?? formations[0]!;
  const roles = form.slots.map((s) => s.role);
  const st = statuses as Record<string, { status: Status }>;
  const cellsOf = (slot: number) => (board[slot] ?? [null, null, null]).map((k) => (k ? byKey.get(k) ?? null : null));
  const boardMap = useMemo(() => new Map(form.slots.map((s) => [s.slot, cellsOf(s.slot)])), [board, form]); // eslint-disable-line react-hooks/exhaustive-deps
  const onBoard = useMemo(() => new Set(Object.values(board).flat().filter((k): k is string => !!k)), [board]);
  const g = gaps(roles, pool, st), w = warnings(roles, boardMap, pool, st, year);
  const placeRole = form.slots.find((s) => s.slot === place)?.role ?? 'MF';
  // candidates: not already in this place, and not starting in another place (they can still be added as a back-up by hand)
  const starting = new Set(Object.values(board).map((c) => c[0]).filter((k): k is string => !!k));
  const suggestions = suggest(pool, placeRole, st, new Set([...(board[place] ?? []).filter((k): k is string => !!k), ...starting]), 4);

  const touch = () => setDirty(true);
  const put = (key: string, slot: number, depth: number) => {
    setBoard((b) => {
      const next: Board = { ...b };
      // a player starts in one place only: as a starter here, they leave any other starting place
      if (depth === 0) for (const [s, c] of Object.entries(next)) if (Number(s) !== slot && c[0] === key) next[Number(s)] = [null, ...c.slice(1)];
      const cells = [...(next[slot] ?? [null, null, null])];
      const was = cells.indexOf(key);
      if (was >= 0) cells[was] = cells[depth] ?? null;            // moving within the place: swap
      cells[depth] = key;
      next[slot] = cells;
      return next;
    });
    setPicked(null); setPlace(slot); touch();
  };
  const remove = (slot: number, depth: number) => { setBoard((b) => { const c = [...(b[slot] ?? [null, null, null])]; c[depth] = null; return { ...b, [slot]: c }; }); touch(); };
  const setOutlook = (key: string, status: Status | '') => {
    setStatuses((s) => { const n = { ...s }; if (status) n[key] = { status, note: s[key]?.note ?? '' }; else delete n[key]; return n; }); touch();
  };
  const changeFormation = (code: string) => {
    const next = formations.find((f) => f.code === code); if (!next) return;
    setBoard((b) => Object.fromEntries(Object.entries(b).filter(([s]) => Number(s) <= next.slots.length)));
    setFormation(code); setPlace(1); touch();
  };
  const drop = (e: DragEvent, slot: number, depth: number) => { e.preventDefault(); const k = e.dataTransfer.getData('text/plain'); if (byKey.has(k)) put(k, slot, depth); };

  const shown = pool.filter((p) => (filter.scope === 'all' || p.inTeam || p.kind !== 'player' || statuses[p.key])
    && (!filter.line || p.line === filter.line || p.second === filter.line) && (!filter.outlook || outlookOf(p, st) === filter.outlook)
    && (!filter.q || p.name.toLowerCase().includes(filter.q.toLowerCase())))
    .sort((a, b) => Number(b.inTeam) - Number(a.inTeam) || (a.kind === 'player' ? 0 : 1) - (b.kind === 'player' ? 0 : 1) || a.name.localeCompare(b.name));

  // what is saved, and what the assistant reads (codes, not names)
  const payload = () => JSON.stringify({
    team: teamId, year, formation, notes,
    slots: Object.entries(board).flatMap(([slot, cells]) => cells.map((key, i) => (key ? { slot: Number(slot), depth: i + 1, key } : null)).filter(Boolean)),
    statuses: Object.entries(statuses).filter(([k]) => k.startsWith('p:')).map(([key, v]) => ({ key, status: v.status, note: v.note })),
  });
  const code = useMemo(() => { const m = new Map<string, string>(); let n = 0; for (const p of pool) if (p.inTeam || onBoard.has(p.key) || statuses[p.key] || p.kind !== 'player') m.set(p.key, `P${++n}`); return m; }, [pool, onBoard, statuses]);
  const facts = () => JSON.stringify({
    year, formation,
    places: form.slots.map((s) => { const c = board[s.slot] ?? []; return { place: s.slot, role: s.role, starter: c[0] ? code.get(c[0]) ?? null : null, backups: c.slice(1).filter((k): k is string => !!k).map((k) => code.get(k)!).filter(Boolean) }; }),
    players: [...code].map(([k, c]) => { const p = byKey.get(k)!; return { code: c, position: p.line, second: p.second, age: p.age, outlook: outlookOf(p, st), attendance: p.attendance?.rate ?? null, games: p.games, goals: p.goals, applicant: p.kind !== 'player' }; }).slice(0, 300),
  });
  const names = useMemo(() => new Map([...code].map(([k, c]) => [c, byKey.get(k)?.name ?? c])), [code, byKey]);
  const withNames = (s: string) => s.replace(/\bP(\d+)\b/g, (m) => names.get(m) ?? m);

  const chip = (p: PoolEntry, slot: number, depth: number) => {
    const o = outlookOf(p, st);
    return (
      <span draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', p.key)} title={`${p.name} · ${t(`o_${o}`)}`}
        className={`flex min-w-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold shadow ${depth === 0 ? OUTLOOK_STYLE[o] : 'bg-white/90 text-ink-950'}`} data-cell={`${slot}-${depth + 1}`} data-key={p.key}>
        {depth ? <span aria-hidden className={`size-2 shrink-0 rounded-full ${DOT[o]}`} /> : null}
        <bdi className="truncate">{surname(p.name)}</bdi>
        <button type="button" onClick={(e) => { e.stopPropagation(); remove(slot, depth); }} aria-label={t('remove', { name: p.name })} className="ms-0.5 opacity-60 hover:opacity-100">×</button>
      </span>
    );
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,19rem)]" data-squad-planner>
      {/* ===== the pitch ===== */}
      <section className="grid content-start gap-3" aria-labelledby="board-h">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="board-h" className="font-display text-lg font-extrabold">{t('boardTitle', { team: teamName, year })}</h2>
          <select value={formation} onChange={(e) => changeFormation(e.target.value)} className="min-h-10 rounded-full border border-line bg-raised px-3 text-sm font-bold" aria-label={t('formation')} data-formation>
            {[11, 9, 8, 7, 5].map((n) => { const list = formations.filter((f) => f.format === n); return list.length ? <optgroup key={n} label={t('format', { n })}>{list.map((f) => <option key={f.code} value={f.code}>{f.code}</option>)}</optgroup> : null; })}
          </select>
        </div>
        {picked ? <p role="status" className="rounded-card bg-accent/15 p-2 text-sm font-semibold text-pitch">{t('pickHint', { name: byKey.get(picked)?.name ?? '' })}</p> : null}
        <div className="relative mx-auto aspect-[4/5] w-full max-w-[42rem] overflow-hidden rounded-card border-4 border-white/70 shadow-inner" dir="ltr"
          style={{ background: 'repeating-linear-gradient(0deg, #2f8f22 0 10%, #349a26 10% 20%)' }} data-pitch>
          <div aria-hidden className="absolute inset-x-[18%] top-0 h-[14%] border-2 border-t-0 border-white/50" /><div aria-hidden className="absolute inset-x-[18%] bottom-0 h-[14%] border-2 border-b-0 border-white/50" />
          <div aria-hidden className="absolute inset-x-0 top-1/2 border-t-2 border-white/50" /><div aria-hidden className="absolute left-1/2 top-1/2 size-[22%] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/50" />
          {form.slots.map((s) => {
            const cells = cellsOf(s.slot), starter = cells[0];
            const weak = !starter || ['unsure', 'leaving', 'target'].includes(starter ? outlookOf(starter, st) : 'unsure');
            return (
              <div key={s.slot} className="absolute flex w-[23%] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5" style={{ left: `${s.x}%`, top: `${s.y}%` }} data-place={s.slot}>
                <button type="button" onClick={() => (picked ? put(picked, s.slot, 0) : setPlace(s.slot))} onDragOver={(e) => e.preventDefault()} onDrop={(e) => drop(e, s.slot, 0)}
                  className={`grid size-11 place-items-center rounded-full border-2 font-display text-xs font-black shadow-lg sm:size-12 ${place === s.slot ? 'border-gold ring-4 ring-gold/40' : 'border-white'} ${starter ? 'bg-ink-950 text-white' : weak ? 'border-dashed bg-white/20 text-white' : ''}`}
                  aria-label={t('placeLabel', { role: t(`line_${s.role}`), n: s.slot })} data-place-button={s.slot}>{t(`short_${s.role}`)}</button>
                {starter ? chip(starter, s.slot, 0) : <span className="rounded-full bg-black/40 px-2 text-[10px] font-bold text-white">{t('empty')}</span>}
                <div className="flex w-full flex-col items-center gap-0.5">
                  {[1, 2].map((d) => cells[d] ? <div key={d} className="max-w-full">{chip(cells[d]!, s.slot, d)}</div> : (
                    <button key={d} type="button" onClick={() => (picked ? put(picked, s.slot, d) : setPlace(s.slot))} onDragOver={(e) => e.preventDefault()} onDrop={(e) => drop(e, s.slot, d)}
                      className="rounded-full border border-dashed border-white/60 px-2 text-[10px] font-semibold text-white/80 hover:bg-white/10" data-backup-slot={`${s.slot}-${d + 1}`}>{t('backupN', { n: d })}</button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <p className="flex flex-wrap gap-3 text-xs text-muted">{(['confirmed', 'likely', 'unsure', 'leaving', 'target'] as const).map((o) => <span key={o} className="inline-flex items-center gap-1"><span aria-hidden className={`size-2.5 rounded-full ${DOT[o]}`} />{t(`o_${o}`)}</span>)}</p>
        <label className="grid gap-1 text-sm font-semibold">{t('notes')}
          <textarea value={notes} onChange={(e) => { setNotes(e.target.value); touch(); }} maxLength={2000} rows={3} className="rounded-control border border-line bg-raised p-2 font-normal" /></label>
        <form action={(fd) => { fd.set('plan', payload()); setDirty(false); return save(fd); }} className="flex flex-wrap items-center gap-3">
          <button disabled={saving} className="min-h-11 rounded-full bg-accent px-6 font-display font-bold text-on-accent hover:brightness-110 disabled:opacity-60" data-save-plan>{saving ? t('saving') : t('save')}</button>
          {dirty ? <span className="text-sm font-semibold text-muted" data-unsaved>{t('unsaved')}</span>
            : saved.status === 'ok' ? <span role="status" className="text-sm font-semibold text-pitch" data-saved>{t('saved')}</span>
            : saved.status === 'error' ? <span role="alert" className="text-sm font-semibold text-danger" data-save-error={saved.error}>{t(`e_${saved.error}` as 'e_failed')}</span> : null}
        </form>
      </section>

      {/* ===== gaps, warnings, suggestions, analysis ===== */}
      <aside className="grid content-start gap-4 sm:grid-cols-2 xl:grid-cols-1">
        <section className="rounded-card border border-line bg-raised p-4" aria-labelledby="gaps-h" data-gaps>
          <h2 id="gaps-h" className="font-display text-lg font-extrabold">{t('gapsTitle')}</h2>
          <ul className="mt-2 grid gap-2">
            {g.map((x) => (
              <li key={x.line} className={`flex items-center justify-between gap-2 rounded-control px-3 py-2 text-sm ${LEVEL[x.level]}`} data-gap={x.line} data-level={x.level}>
                <span className="font-bold">{t(`line_${x.line}`)}</span>
                <span className="text-end text-xs font-semibold">{t('gapLine', { confirmed: x.confirmed, need: x.need })}{x.missing ? <> · <b>{t('missingN', { n: x.missing })}</b></> : null}</span>
              </li>
            ))}
          </ul>
        </section>
        {w.length ? (
          <section className="rounded-card border border-gold bg-gold/10 p-4" aria-labelledby="warn-h" data-warnings>
            <h2 id="warn-h" className="font-display text-lg font-extrabold">{t('warnTitle')}</h2>
            <ul className="mt-2 grid gap-1.5 text-sm">{w.map((x) => <li key={x.key} className="flex gap-2" data-warning={x.key}><span aria-hidden className="font-black text-danger">!</span>{t(x.key as 'w_keepers', x.values as Record<string, number>)}</li>)}</ul>
          </section>
        ) : null}
        <section className="rounded-card border border-line bg-raised p-4" aria-labelledby="sug-h" data-suggestions>
          <h2 id="sug-h" className="font-display text-lg font-extrabold">{t('sugTitle', { role: t(`line_${placeRole}`), n: place })}</h2>
          <p className="text-xs text-muted">{t('sugLead')}</p>
          {suggestions.length ? (
            <ol className="mt-2 grid gap-2">
              {suggestions.map((f, i) => (
                <li key={f.entry.key} className="grid gap-1 rounded-control border border-line p-2" data-suggestion={f.entry.key}>
                  <div className="flex items-center gap-2"><span className="grid size-6 place-items-center rounded-full bg-fg text-xs font-black text-white">{i + 1}</span>
                    <bdi className="min-w-0 flex-1 truncate font-bold">{f.entry.name}</bdi><span className="rounded-full bg-accent/15 px-2 text-xs font-black text-pitch">{f.score}</span></div>
                  <p className="text-[11px] text-muted">{f.reasons.map((r) => t(r.key as 'r_main', { v: r.value ?? '' })).join(' · ')}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {[0, 1, 2].map((d) => <button key={d} type="button" onClick={() => put(f.entry.key, place, d)} className="min-h-8 rounded-full border border-line px-2.5 text-xs font-bold hover:border-accent" data-place-as={d + 1}>{d ? t('asBackup', { n: d }) : t('asStarter')}</button>)}
                  </div>
                </li>
              ))}
            </ol>
          ) : <p className="mt-2 text-sm font-semibold text-danger" data-no-suggestions>{t('noCandidates')}</p>}
          {(() => { const s = cellsOf(place)[0]; const f = s ? fit(s, placeRole, outlookOf(s, st)) : null; return s ? <p className="mt-2 text-xs text-muted">{t('currentStarter', { name: s.name, score: f?.score ?? 0 })}</p> : null; })()}
        </section>
        <section className="rounded-card border border-line bg-raised p-4" aria-labelledby="ai-h" data-analysis>
          <h2 id="ai-h" className="font-display text-lg font-extrabold">{t('aiTitle')}</h2>
          <p className="text-xs text-muted">{t('aiLead')}</p>
          {canAnalyse ? (
            <form action={(fd) => { fd.set('team', teamId); fd.set('facts', facts()); return analyse(fd); }} className="mt-2">
              <button disabled={analysing} className="min-h-10 rounded-full border-2 border-fg px-4 text-sm font-bold hover:bg-fg hover:text-white disabled:opacity-60" data-analyse>{analysing ? t('analysing') : t('analyse')}</button>
            </form>
          ) : <p className="mt-2 text-sm text-muted">{t('aiOff')}</p>}
          {ai.status === 'error' ? <p role="alert" className="mt-2 text-sm font-semibold text-danger">{t(`ai_${ai.error}` as 'ai_api')}</p> : null}
          {ai.status === 'ok' ? (
            <div className="mt-3 grid gap-3 text-sm" data-analysis-result>
              <p className="font-semibold">{withNames(ai.analysis.summary)}</p>
              {(['strengths', 'gaps', 'recruit', 'risks'] as const).map((k) => ai.analysis[k].length ? (
                <div key={k}><p className="text-xs font-black uppercase tracking-widest text-muted">{t(`ai_${k}`)}</p>
                  <ul className="mt-1 grid list-disc gap-1 ps-5">{ai.analysis[k].map((x, i) => <li key={i}>{withNames(x)}</li>)}</ul></div>
              ) : null)}
            </div>
          ) : null}
        </section>
      </aside>
      {/* ===== the pool ===== */}
      <section className="grid content-start gap-3 rounded-card border border-line bg-raised p-4 xl:col-span-2" aria-labelledby="pool-h">
        <div className="flex items-center justify-between gap-2"><h2 id="pool-h" className="font-display text-lg font-extrabold">{t('pool')} <span className="text-sm font-semibold text-muted">{shown.length}</span></h2><span className="hidden text-xs text-muted sm:inline">{t('poolHint')}</span></div>
        <input type="search" value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} placeholder={t('search')} className="min-h-10 rounded-full border border-line bg-raised px-3 text-sm" />
        <div className="flex flex-wrap gap-1.5 text-xs font-bold">
          {(['', 'GK', 'DF', 'MF', 'FW'] as const).map((l) => <button key={l || 'all'} type="button" onClick={() => setFilter({ ...filter, line: l })} className={`min-h-8 rounded-full border px-2.5 ${filter.line === l ? 'border-fg bg-fg text-white' : 'border-line'}`} data-pool-line={l || 'all'}>{l ? t(`line_${l}`) : t('all')}</button>)}
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs font-bold">
          {(['', 'confirmed', 'likely', 'unsure', 'leaving', 'target'] as const).map((o) => <button key={o || 'all'} type="button" onClick={() => setFilter({ ...filter, outlook: o })} className={`inline-flex min-h-8 items-center gap-1 rounded-full border px-2.5 ${filter.outlook === o ? 'border-fg bg-fg text-white' : 'border-line'}`}>{o ? <span aria-hidden className={`size-2 rounded-full ${DOT[o]}`} /> : null}{o ? t(`o_${o}`) : t('all')}</button>)}
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={filter.scope === 'all'} onChange={(e) => setFilter({ ...filter, scope: e.target.checked ? 'all' : 'team' })} className="size-4 accent-accent" />{t('allClub')}</label>
        <ul className="grid max-h-[34rem] gap-2 overflow-y-auto pe-1 sm:grid-cols-[repeat(auto-fill,minmax(15rem,1fr))]" data-pool>
          {shown.map((p) => {
            const o = outlookOf(p, st);
            return (
              <li key={p.key} draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', p.key)} data-pool-entry={p.key}
                className={`grid gap-1 rounded-control border p-2 text-sm ${picked === p.key ? 'border-accent ring-2 ring-accent' : 'border-line'} ${onBoard.has(p.key) ? 'bg-surface' : 'bg-raised'}`}>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setPicked(picked === p.key ? null : p.key)} className="flex min-w-0 flex-1 items-center gap-2 text-start" aria-pressed={picked === p.key}>
                    <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${DOT[o]}`} />
                    <bdi className="truncate font-bold">{p.name}</bdi>
                  </button>
                  <span className="shrink-0 rounded-full bg-fg/10 px-1.5 text-[10px] font-black">{p.line ?? '–'}{p.second ? `/${p.second}` : ''}</span>
                </div>
                <p className="flex flex-wrap gap-x-2 text-[11px] text-muted">
                  {p.age != null ? <span>{t('ageN', { n: p.age })}</span> : null}
                  {p.attendance ? <span>{t('attN', { n: p.attendance.rate })}</span> : null}
                  {p.games ? <span>{t('gamesN', { n: p.games, goals: p.goals })}</span> : null}
                  {p.kind !== 'player' ? <span className="font-semibold text-fg">{t(`k_${p.kind}`)}{p.previousTeam ? ` · ${p.previousTeam}` : ''}</span> : null}
                  {p.contractConfirmed ? <span className="font-semibold text-pitch">{t('contractOk')}</span> : p.contract ? <span>{t('contractEnds', { date: p.contract.endsOn })}</span> : null}
                </p>
                {p.kind === 'player' && !p.contractConfirmed ? (
                  <select value={statuses[p.key]?.status ?? ''} onChange={(e) => setOutlook(p.key, e.target.value as Status | '')} aria-label={t('outlookFor', { name: p.name })}
                    className="min-h-8 rounded-full border border-line bg-raised px-2 text-xs font-semibold" data-outlook={p.key}>
                    <option value="">{t('o_unset')}</option>{(['confirmed', 'likely', 'unsure', 'leaving'] as const).map((s) => <option key={s} value={s}>{t(`o_${s}`)}</option>)}
                  </select>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

    </div>
  );
}
