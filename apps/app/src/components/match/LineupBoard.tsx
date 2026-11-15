'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { useTranslations } from 'next-intl';
import { saveLineup } from '@/app/actions/match';
import { lineupImage, lineupVideo, shareOrDownload, type ExportData } from '@/lib/lineup-export';
import {
  BENCH_SIZE, FORMATION_TAGS, FORMATS, LINES, PRESETS, PRESSING, STYLES, STYLE_FORMATION, TEMPOS, WIDTHS,
  type FormationDef, type Format, type PlannedSub, type Role, type Style,
} from '@/lib/match';

export interface BoardPlayer {
  id: string; name: string; shirt: number | null; role: Role | null; role2: Role | null;
  reply: 'pending' | 'yes' | 'no' | 'maybe'; note: string | null; photo: string | null; phone: string | null;
  attendance: number | null; seasonMinutes: number; seasonMatches: number;
}
export interface BoardPlan { style: Style; line: string; press: string; width: string; tempo: string; text: string }
interface Props {
  matchId: string; back: string; team: string; opponent: string; whenLabel: string; locked: boolean;
  formations: FormationDef[]; roster: BoardPlayer[];
  initial: { formation: string; starters: Record<number, string>; subs: string[]; captain: string | null; rotation: PlannedSub[]; plan: BoardPlan };
}
type Src = { id: string; from: 'pool' | 'bench' | 'slot'; slot?: number };
type Reply = BoardPlayer['reply'];

const RI: Record<Role, number> = { GK: 0, DF: 1, MF: 2, FW: 3 };
const ROLES: Role[] = ['GK', 'DF', 'MF', 'FW'];
const REPLY_STYLE: Record<Reply, string> = { yes: 'bg-accent/20 text-pitch', no: 'bg-danger/15 text-danger', maybe: 'bg-fg/10 text-fg', pending: 'bg-line text-muted' };
const MATCH_LENGTH: Record<Format, number> = { 11: 90, 9: 70, 8: 60, 7: 60, 5: 40 };
const initials = (n: string) => n.split(' ').map((x) => x[0]).slice(0, 2).join('').toUpperCase();
const surname = (n: string) => n.split(' ').slice(-1)[0] ?? n;
const waDigits = (p: string) => p.replace(/[^\d]/g, '');

/**
 * Lineup board: lineup style drop-down with its description beside the pitch, formations for 5 v 5 to 11 v 11,
 * drag and drop (list or bench → pitch, marker → marker to swap, → bench, → list to remove; tapping works too),
 * player cards with photo, positions, reply, attendance and season minutes, rotation plan with planned minutes,
 * availability summary with a reminder text, checks, and export (PNG, JPG, share, video clip, text).
 * Everything is saved in one step (save_lineup, migration 0032), so the style, formation and lineup always match.
 */
export function LineupBoard({ matchId, back, team, opponent, whenLabel, locked, formations, roster, initial }: Props) {
  const t = useTranslations('match');
  const byCode = useMemo(() => new Map(formations.map((f) => [f.code, f])), [formations]);
  const byId = useMemo(() => new Map(roster.map((p) => [p.id, p])), [roster]);
  const [formation, setFormation] = useState(byCode.has(initial.formation) ? initial.formation : '4-4-2');
  const [starters, setStarters] = useState<Record<number, string>>(initial.starters);
  const [subs, setSubs] = useState<string[]>(initial.subs);
  const [captain, setCaptain] = useState<string | null>(initial.captain);
  const [rotation, setRotation] = useState<PlannedSub[]>(initial.rotation);
  const [plan, setPlan] = useState<BoardPlan>(initial.plan);
  const [selected, setSelected] = useState<number | null>(null);
  const [roleFilter, setRoleFilter] = useState<'all' | Role>('all');
  const [replyFilter, setReplyFilter] = useState<'all' | Reply>('all');
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');
  const [ghost, setGhost] = useState<{ x: number; y: number; label: string } | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [rotMin, setRotMin] = useState(60); const [rotOff, setRotOff] = useState(''); const [rotOn, setRotOn] = useState('');
  const dragRef = useRef<{ src: Src; sx: number; sy: number; started: boolean } | null>(null);
  const justDragged = useRef(false);
  const dirty = useRef(false);

  const def = byCode.get(formation) ?? formations[0]!;
  const slots = def.slots;
  const format = def.format;
  const length = MATCH_LENGTH[format];
  const used = new Set([...Object.values(starters), ...subs]);
  const say = (k: string, v?: Record<string, string | number>) => { setMsg(t(k as 'copied', v as never)); setTimeout(() => setMsg(''), 3000); };
  const touch = () => { dirty.current = true; };
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty.current && !locked) { e.preventDefault(); } };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [locked]);

  // ---------- reshape: keep the players, place them by position in the new shape ----------
  function reshape(code: string, from = starters, bench = subs) {
    const next = byCode.get(code); if (!next) return;
    const old = byCode.get(formation)?.slots ?? [];
    const list = old.map((s) => ({ id: from[s.slot], role: s.role })).filter((x): x is { id: string; role: Role } => !!x.id);
    const usedIds = new Set<string>(); const placed: Record<number, string> = {};
    for (const s of next.slots) { const i = list.findIndex((o) => !usedIds.has(o.id) && o.role === s.role); if (i >= 0) { placed[s.slot] = list[i]!.id; usedIds.add(list[i]!.id); } }
    for (const s of next.slots) {
      if (placed[s.slot] || s.role === 'GK') continue;
      const c = list.filter((o) => !usedIds.has(o.id) && o.role !== 'GK').sort((a, b) => Math.abs(RI[a.role] - RI[s.role]) - Math.abs(RI[b.role] - RI[s.role]))[0];
      if (c) { placed[s.slot] = c.id; usedIds.add(c.id); }
    }
    const left = list.filter((o) => !usedIds.has(o.id)).map((o) => o.id);
    setFormation(code); setStarters(placed); setSubs([...bench.filter((x) => !usedIds.has(x)), ...left].slice(0, 12)); setSelected(null);
    setRotation((r) => r.filter((x) => usedIds.has(x.off) || bench.includes(x.off) || left.includes(x.off))); touch();
  }
  function chooseStyle(style: Style) {
    const p = PRESETS[style];
    setPlan((x) => ({ ...x, style, line: p.line, press: p.press, width: p.width, tempo: p.tempo }));
    reshape(STYLE_FORMATION[format][style]);
  }
  function chooseFormat(f: Format) { reshape(STYLE_FORMATION[f][plan.style]); }

  // ---------- moves ----------
  const without = (id: string) => [Object.fromEntries(Object.entries(starters).filter(([, v]) => v !== id)) as Record<number, string>, subs.filter((x) => x !== id)] as const;
  function toSlot(id: string, n: number) {
    if (locked) return;
    const fromSlot = Number(Object.entries(starters).find(([, v]) => v === id)?.[0] ?? 0);
    const fromBench = subs.includes(id);
    const occupant = starters[n];
    const ns = { ...starters }; let nb = [...subs];
    if (fromSlot) delete ns[fromSlot];
    if (fromBench) nb = nb.filter((x) => x !== id);
    if (occupant && occupant !== id) {
      if (fromSlot) ns[fromSlot] = occupant;      // marker onto marker: swap
      else if (fromBench) nb.push(occupant);      // bench player in, the one in that position to the bench
    }                                             // from the list: the one in that position goes back to the list
    ns[n] = id; setStarters(ns); setSubs(nb); setSelected(null);
    if (occupant && occupant !== id && !fromSlot && !fromBench && captain === occupant) setCaptain(null);
    touch();
  }
  function start(id: string) {
    const p = byId.get(id);
    const target = selected ?? slots.find((s) => !starters[s.slot] && s.role === p?.role)?.slot ?? slots.find((s) => !starters[s.slot] && (s.role === 'GK') === (p?.role === 'GK'))?.slot ?? slots.find((s) => !starters[s.slot])?.slot;
    if (target) toSlot(id, target);
  }
  function toBench(id: string) { if (locked || (subs.length >= 12 && !subs.includes(id))) return; const [ns, nb] = without(id); setStarters(ns); setSubs([...nb, id]); touch(); }
  function remove(id: string) { if (locked) return; const [ns, nb] = without(id); setStarters(ns); setSubs(nb); if (captain === id) setCaptain(null); setRotation((r) => r.filter((x) => x.on !== id && x.off !== id)); touch(); }
  function tapSlot(n: number) {
    if (justDragged.current || locked) return;
    if (selected !== null && selected !== n) { const a = starters[selected]; if (a) toSlot(a, n); else setSelected(n); return; }
    setSelected(selected === n ? null : n);
  }
  function autoFill() {
    const rank = (p: BoardPlayer) => (p.reply === 'yes' ? 0 : p.reply === 'maybe' ? 1 : 2);
    // fair rotation: among equal replies, players with fewer season minutes first
    const c = roster.filter((p) => p.reply !== 'no').sort((a, b) => rank(a) - rank(b) || a.seasonMinutes - b.seasonMinutes || a.name.localeCompare(b.name));
    const ns = { ...starters }; const taken = new Set([...Object.values(ns), ...subs]);
    for (const exact of [true, false]) for (const s of slots) {
      if (ns[s.slot]) continue;
      const p = exact ? c.find((x) => !taken.has(x.id) && (x.role === s.role || x.role2 === s.role))
        : s.role === 'GK' ? undefined : c.filter((x) => !taken.has(x.id) && x.role !== 'GK').sort((a, b) => Math.abs(RI[a.role ?? 'MF'] - RI[s.role]) - Math.abs(RI[b.role ?? 'MF'] - RI[s.role]))[0];
      if (p) { ns[s.slot] = p.id; taken.add(p.id); }
    }
    const nb = [...subs, ...c.filter((x) => !taken.has(x.id) && x.reply !== 'pending').map((x) => x.id)].slice(0, Math.max(subs.length, BENCH_SIZE[format]));
    setStarters(ns); setSubs(nb); touch();
  }

  // ---------- drag and drop (pointer events: mouse, pen and touch) ----------
  function onDown(e: RPointerEvent, src: Src) {
    if (locked || e.button > 0) return;
    if (e.pointerType !== 'mouse' && !(e.target as HTMLElement).closest('[data-handle]')) return; // touch: drag by the handle or a marker, scroll elsewhere
    // no text selection or native drag of selected text (that would cancel the pointer and break the drag)
    if (e.pointerType === 'mouse' && !(e.target as HTMLElement).closest('button, a, input, select, textarea')) e.preventDefault();
    window.getSelection()?.removeAllRanges();
    dragRef.current = { src, sx: e.clientX, sy: e.clientY, started: false };
    const move = (ev: PointerEvent) => {
      const d = dragRef.current; if (!d) return;
      if (!d.started && Math.hypot(ev.clientX - d.sx, ev.clientY - d.sy) < 6) return;
      if (!d.started) window.getSelection()?.removeAllRanges();
      d.started = true; ev.preventDefault();
      setGhost({ x: ev.clientX, y: ev.clientY, label: byId.get(d.src.id)?.name ?? '' });
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('[data-drop]');
      setHover(el?.dataset.drop ?? null);
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      const d = dragRef.current; dragRef.current = null; setGhost(null); setHover(null);
      if (!d?.started || ev.type === 'pointercancel') return;
      justDragged.current = true; setTimeout(() => { justDragged.current = false; }, 0);
      const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('[data-drop]')?.dataset.drop;
      if (!target) return;
      if (target.startsWith('slot-')) toSlot(d.src.id, Number(target.slice(5)));
      else if (target === 'bench') toBench(d.src.id);
      else if (target === 'pool') remove(d.src.id);
    };
    window.addEventListener('pointermove', move, { passive: false }); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  }

  // ---------- rotation plan ----------
  const sim = useMemo(() => {
    const st: Record<string, number> = {}, en: Record<string, number> = {}; const ok: boolean[] = [];
    Object.values(starters).forEach((id) => { st[id] = 0; en[id] = length; });
    const sorted = [...rotation].sort((a, b) => a.minute - b.minute);
    for (const r of sorted) {
      const good = en[r.off] !== undefined && en[r.off]! > r.minute && st[r.on] === undefined && subs.includes(r.on);
      ok.push(good); if (good) { en[r.off] = r.minute; st[r.on] = r.minute; en[r.on] = length; }
    }
    const minutes = (id: string) => (st[id] === undefined ? 0 : en[id]! - st[id]!);
    return { sorted, ok, minutes };
  }, [starters, subs, rotation, length]);
  const plannedOffOptions = [...Object.values(starters), ...rotation.map((r) => r.on)].filter((id, i, a) => a.indexOf(id) === i && !rotation.some((r) => r.off === id));
  const plannedOnOptions = subs.filter((id) => !rotation.some((r) => r.on === id));
  function addRotation() {
    const off = rotOff || plannedOffOptions[0], on = rotOn || plannedOnOptions[0];
    if (!off || !on || off === on) return;
    setRotation((r) => [...r, { minute: Math.min(rotMin, length - 1), off, on }]); setRotOff(''); setRotOn(''); touch();
  }

  // ---------- checks ----------
  const count = Object.keys(starters).length;
  const gk = slots[0] && starters[slots[0].slot] ? byId.get(starters[slots[0].slot]!) : undefined;
  const saidNo = [...used].map((id) => byId.get(id)).filter((p): p is BoardPlayer => !!p && p.reply === 'no');
  const outOfPosition = slots.filter((s) => { const p = starters[s.slot] ? byId.get(starters[s.slot]!) : undefined; return !!p?.role && p.role !== s.role && p.role2 !== s.role; }).length;
  const badRotation = sim.ok.filter((x) => !x).length;
  const checks = [
    { key: 'xi', ok: count === slots.length, text: t('checkXIof', { count, size: slots.length }) },
    { key: 'gk', ok: !!gk && gk.role === 'GK', text: gk ? (gk.role === 'GK' ? t('checkGk') : t('checkGkNot', { name: gk.name })) : t('checkNoGk') },
    { key: 'no', ok: saidNo.length === 0, text: saidNo.length ? t('checkSaidNo', { names: saidNo.map((p) => p.name).join(', ') }) : t('checkReplies') },
    { key: 'pos', ok: outOfPosition === 0, text: outOfPosition ? t('checkOutOfPosition', { count: outOfPosition }) : t('checkPositions') },
    { key: 'cap', ok: !!captain, text: captain ? t('checkCaptain', { name: byId.get(captain)?.name ?? '' }) : t('checkNoCaptain') },
    { key: 'bench', ok: subs.length > 0, text: t('checkBench', { count: subs.length }) },
    ...(rotation.length ? [{ key: 'rot', ok: badRotation === 0, text: badRotation ? t('checkRotationBad', { count: badRotation }) : t('checkRotation', { count: rotation.length }) }] : []),
  ];

  // ---------- availability ----------
  const replies: Record<Reply, number> = { yes: 0, maybe: 0, no: 0, pending: 0 };
  roster.forEach((p) => { replies[p.reply]++; });
  const noReply = roster.filter((p) => p.reply === 'pending');
  const reminder = t('reminderText', { names: noReply.map((p) => p.name.split(' ')[0]).join(', '), opponent, when: whenLabel });
  const pool = roster.filter((p) => !used.has(p.id) && (roleFilter === 'all' || p.role === roleFilter || p.role2 === roleFilter) && (replyFilter === 'all' || p.reply === replyFilter)
    && (!q || p.name.toLowerCase().includes(q.toLowerCase()) || String(p.shirt ?? '') === q.trim()))
    .sort((a, b) => (a.reply === 'no' ? 1 : 0) - (b.reply === 'no' ? 1 : 0) || RI[a.role ?? 'MF'] - RI[b.role ?? 'MF'] || (a.shirt ?? 99) - (b.shirt ?? 99));

  // ---------- export ----------
  const styleLabel = t(`style_${plan.style}`);
  const asText = () => {
    const line = (id: string) => { const p = byId.get(id); return p ? `${p.shirt ? `#${p.shirt} ` : ''}${p.name}${captain === id ? ' (C)' : ''}` : ''; };
    const rows = ROLES.map((r) => slots.filter((s) => s.role === r && starters[s.slot]).map((s) => line(starters[s.slot]!)).join(', ')).filter(Boolean);
    return [`${t('textTitle', { opponent })} · ${whenLabel}`, `${formation} · ${styleLabel}`, ...rows, `${t('bench')}: ${subs.map(line).join(', ') || '–'}`].join('\n');
  };
  const exportData = (): ExportData => ({
    team, title: t('textTitle', { opponent }), subtitle: whenLabel, formation, styleLabel, slots,
    onPitch: Object.fromEntries(slots.filter((s) => starters[s.slot]).map((s) => { const p = byId.get(starters[s.slot]!)!; return [s.slot, { name: p.name, shirt: p.shirt, captain: captain === p.id }]; })),
    bench: subs.map((id) => byId.get(id)).filter((p): p is BoardPlayer => !!p).map((p) => ({ name: p.name, shirt: p.shirt })), benchLabel: t('bench'), footer: 'Afro Foot Club',
  });
  async function doExport(kind: 'png' | 'jpg' | 'share' | 'video') {
    setBusy(kind);
    try {
      const slug = `lineup-${opponent.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)}`;
      if (kind === 'video') {
        const v = await lineupVideo(exportData());
        if (!v) { say('videoUnsupported'); return; }
        const r = await shareOrDownload(v.blob, `${slug}.${v.ext}`, asText()); if (r !== 'cancelled') say(r === 'shared' ? 'shared' : 'downloaded');
        return;
      }
      const blob = await lineupImage(exportData(), kind === 'png' ? 'image/png' : 'image/jpeg');
      const name = `${slug}.${kind === 'png' ? 'png' : 'jpg'}`;
      if (kind === 'share') { const r = await shareOrDownload(blob, name, asText()); if (r !== 'cancelled') say(r === 'shared' ? 'shared' : 'downloaded'); return; }
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      say('downloaded');
    } catch { say('exportFailed'); } finally { setBusy(''); }
  }
  async function copy(text: string, k = 'copied') { try { await navigator.clipboard.writeText(text); say(k); } catch { say('exportFailed'); } }

  // ---------- pieces ----------
  const Avatar = ({ p, size = 'size-10' }: { p: BoardPlayer; size?: string }) => p.photo
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={p.photo} alt="" className={`${size} shrink-0 rounded-full object-cover`} draggable={false} />
    : <span className={`${size} flex shrink-0 items-center justify-center rounded-full bg-fg/10 text-xs font-black`} aria-hidden>{initials(p.name)}</span>;
  const ReplyChip = ({ p }: { p: BoardPlayer }) => <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${REPLY_STYLE[p.reply]}`} title={p.note ?? undefined}>{t(`reply_${p.reply}`)}</span>;
  const shape = (code: string) => { const d = byCode.get(code); const c = { DF: 0, MF: 0, FW: 0 }; d?.slots.forEach((s) => { if (s.role !== 'GK') c[s.role]++; }); return c; };
  const lines = shape(formation);
  const zone = (id: string) => (hover === id ? 'ring-4 ring-accent' : '');

  return (
    <div className="grid gap-5" data-board>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,30rem)_minmax(0,1fr)]">
        {/* ===== pitch ===== */}
        <div className="grid content-start gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-semibold"><span data-count>{count}/{slots.length}</span> {t('startingXIshort')} · <span dir="ltr">{format} v {format}</span></span>
            {locked ? null : <span className="flex flex-wrap gap-2">
              <button type="button" onClick={autoFill} data-autofill className="min-h-10 rounded-full border-2 border-fg px-4 text-sm font-bold hover:bg-fg hover:text-raised">{t('autoFill')}</button>
              <button type="button" onClick={() => { setStarters({}); setSubs([]); setCaptain(null); setRotation([]); touch(); }} className="min-h-10 rounded-full border border-line px-4 text-sm font-semibold hover:border-danger">{t('clear')}</button>
            </span>}
          </div>
          <div className={`relative mx-auto aspect-[68/100] w-full max-w-[30rem] touch-manipulation select-none overflow-hidden rounded-[22px] shadow-[0_14px_34px_rgba(10,42,10,.25)] ${locked ? '' : ''}`}
            style={{ background: 'repeating-linear-gradient(0deg, #2f8f22 0 10%, #349a26 10% 20%)' }} dir="ltr" role="group" aria-label={t('pitch')}>
            <div className="pointer-events-none absolute inset-3 rounded-md border-2 border-white/50" />
            <div className="pointer-events-none absolute inset-x-3 top-1/2 h-0.5 bg-white/50" />
            <div className="pointer-events-none absolute left-1/2 top-1/2 size-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/50" />
            <div className="pointer-events-none absolute bottom-3 left-1/2 h-[15%] w-[52%] -translate-x-1/2 border-2 border-b-0 border-white/50" />
            <div className="pointer-events-none absolute left-1/2 top-3 h-[15%] w-[52%] -translate-x-1/2 border-2 border-t-0 border-white/50" />
            {slots.map((s) => {
              const p = starters[s.slot] ? byId.get(starters[s.slot]!) : undefined;
              const sel = selected === s.slot;
              return (
                <div key={s.slot} data-drop={`slot-${s.slot}`} className="absolute w-[4.75rem] -translate-x-1/2 -translate-y-1/2" style={{ left: `${s.x}%`, top: `${s.y}%` }}>
                  <button type="button" onClick={() => tapSlot(s.slot)} onPointerDown={p ? (e) => onDown(e, { id: p.id, from: 'slot', slot: s.slot }) : undefined}
                    data-slot={s.slot} data-role={s.role} data-filled={p ? p.id : ''} data-handle={p ? '' : undefined} aria-pressed={sel}
                    aria-label={p ? `${t(`role_${s.role}`)}: ${p.name}` : `${t(`role_${s.role}`)}: ${t('empty')}`}
                    className={`flex w-full touch-none flex-col items-center gap-0.5 focus:outline-none ${p && !locked ? 'cursor-grab' : ''}`}>
                    <span className={`relative flex size-12 items-center justify-center rounded-full border-[3px] font-display text-base font-black shadow-md transition-transform ${p ? (s.role === 'GK' ? 'border-white bg-ink-950 text-white' : 'border-white bg-white text-ink-950') : 'border-dashed border-white/80 bg-white/15 text-xs text-white'} ${sel || hover === `slot-${s.slot}` ? 'scale-110 ring-4 ring-accent' : ''}`}>
                      {p?.photo ? (/* eslint-disable-next-line @next/next/no-img-element */<img src={p.photo} alt="" draggable={false} className="size-full rounded-full object-cover" />) : p ? (p.shirt ?? initials(p.name)) : s.role}
                      {p && p.photo ? <span className="absolute -bottom-1 -end-1 rounded-full bg-ink-950 px-1.5 text-[10px] font-black text-white">{p.shirt ?? ''}</span> : null}
                      {p && captain === p.id ? <span className="absolute -start-1 -top-1 flex size-5 items-center justify-center rounded-full bg-accent text-[10px] font-black text-on-accent">C</span> : null}
                      {p && p.reply === 'no' ? <span className="absolute -end-1 -top-1 flex size-5 items-center justify-center rounded-full bg-danger text-[10px] font-black text-white" aria-label={t('reply_no')}>!</span> : null}
                    </span>
                    <span className="max-w-full truncate rounded bg-black/60 px-1.5 text-[11px] font-semibold text-white">{p ? surname(p.name) : t(`role_${s.role}`)}</span>
                  </button>
                </div>
              );
            })}
          </div>

          {/* bench */}
          <div data-drop="bench" className={`rounded-card border-2 border-dashed p-3 transition ${hover === 'bench' ? 'border-accent bg-accent/10' : 'border-line bg-surface'}`}>
            <p className="text-xs font-bold uppercase tracking-widest text-muted">{t('bench')} ({subs.length}/12) <span className="normal-case tracking-normal">· {t('benchHint')}</span></p>
            {subs.length === 0 ? <p className="mt-1 text-sm text-muted">–</p> : (
              <ul className="mt-2 flex flex-wrap gap-2">
                {subs.map((id) => { const p = byId.get(id); return p ? (
                  <li key={id} data-bench={id} onPointerDown={(e) => onDown(e, { id, from: 'bench' })} className={`flex select-none items-center gap-2 rounded-full border border-line bg-raised py-1 pe-1 ps-1 text-sm ${locked ? '' : 'cursor-grab'}`}>
                    {locked ? null : <span data-handle aria-hidden className="cursor-grab touch-none px-1 text-muted">⋮⋮</span>}
                    <Avatar p={p} size="size-7" /><span className="font-bold" dir="ltr">{p.shirt ?? ''}</span><bdi className="font-semibold">{p.name}</bdi><ReplyChip p={p} />
                    {locked ? null : <>
                      <button type="button" onClick={() => start(id)} className="min-h-8 rounded-full border border-line px-2 text-xs font-bold hover:border-accent">{t('start')}</button>
                      <button type="button" onClick={() => setCaptain(captain === id ? null : id)} aria-pressed={captain === id} aria-label={`${t('captain')}: ${p.name}`} className={`min-h-8 rounded-full px-2 text-xs font-bold ${captain === id ? 'bg-accent text-on-accent' : 'border border-line'}`}>C</button>
                      <button type="button" onClick={() => remove(id)} aria-label={`${t('remove')}: ${p.name}`} className="min-h-8 rounded-full border border-line px-2 text-xs font-bold hover:border-danger">✕</button>
                    </>}
                  </li>) : null; })}
              </ul>
            )}
          </div>

          {/* starters list: captain and moves without dragging */}
          {count ? (
            <details className="rounded-card border border-line p-3">
              <summary className="cursor-pointer text-sm font-semibold">{t('startingXI')} ({count}/{slots.length})</summary>
              <ul className="mt-2 grid gap-1">
                {slots.filter((s) => starters[s.slot]).map((s) => { const p = byId.get(starters[s.slot]!)!; return (
                  <li key={s.slot} data-starter={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-card bg-surface px-3 py-1.5 text-sm">
                    <span><span className="me-1 inline-block w-8 font-bold text-muted">{t(`role_${s.role}`)}</span><bdi className="font-semibold">{p.name}</bdi> <ReplyChip p={p} /></span>
                    {locked ? null : <span className="flex gap-1">
                      <button type="button" onClick={() => setCaptain(captain === p.id ? null : p.id)} aria-pressed={captain === p.id} aria-label={`${t('captain')}: ${p.name}`} className={`min-h-9 rounded-full px-3 text-xs font-bold ${captain === p.id ? 'bg-accent text-on-accent' : 'border border-line hover:border-accent'}`}>C</button>
                      <button type="button" onClick={() => toBench(p.id)} className="min-h-9 rounded-full border border-line px-3 text-xs font-bold hover:border-accent">{t('toBench')}</button>
                      <button type="button" onClick={() => remove(p.id)} aria-label={`${t('remove')}: ${p.name}`} className="min-h-9 rounded-full border border-line px-3 text-xs font-bold hover:border-danger">✕</button>
                    </span>}
                  </li>); })}
              </ul>
            </details>
          ) : null}
        </div>

        {/* ===== side: style, instructions, availability, players ===== */}
        <aside className="grid content-start gap-4">
          <div className="rounded-[22px] p-5 text-white shadow-[0_12px_30px_rgba(10,26,8,.25)]" style={{ background: 'radial-gradient(120% 90% at 100% 0, #1f5a17 0, #0b0f0a 58%)' }} data-style-panel={plan.style}>
            <div className="grid gap-3">
              <label className="grid gap-1 text-xs font-bold uppercase tracking-widest text-white/70">{t('style')}
                <select name="style_pick" value={plan.style} disabled={locked} onChange={(e) => chooseStyle(e.target.value as Style)} className="min-h-11 w-full min-w-0 rounded-full border-0 bg-white px-4 text-base font-bold normal-case tracking-normal text-ink-950">
                  {STYLES.map((s) => <option key={s} value={s}>{t(`style_${s}`)}</option>)}
                </select></label>
              <label className="grid gap-1 text-xs font-bold uppercase tracking-widest text-white/70">{t('formationFormat')}
                <select name="formation_pick" value={formation} disabled={locked} onChange={(e) => reshape(e.target.value)} className="min-h-11 w-full min-w-0 rounded-full border-0 bg-white px-4 text-base font-bold normal-case tracking-normal text-ink-950">
                  {FORMATS.map((f) => (
                    <optgroup key={f} label={`${f} v ${f}`}>
                      {formations.filter((x) => x.format === f).map((x) => <option key={x.code} value={x.code}>{x.code} · {(FORMATION_TAGS[x.code] ?? []).map((k) => t(`tag_${k}`)).join(' · ')}</option>)}
                    </optgroup>
                  ))}
                </select></label>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label={t('format')}>
              {FORMATS.map((f) => <button key={f} type="button" disabled={locked} onClick={() => chooseFormat(f)} aria-pressed={format === f} data-format={f}
                className={`min-h-9 rounded-full px-3 text-xs font-bold ${format === f ? 'bg-accent text-white' : 'bg-white/10 text-white hover:bg-white/20'}`} dir="ltr">{f} v {f}</button>)}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="font-display text-4xl font-black tracking-tight" dir="ltr" data-shape>{formation}</span>
              <span className="flex flex-wrap gap-1.5">{(FORMATION_TAGS[formation] ?? []).map((k) => <span key={k} className="rounded-full bg-accent px-2.5 py-1 text-xs font-bold">{t(`tag_${k}`)}</span>)}</span>
            </div>
            <div className="mt-3 grid grid-cols-[5.5rem_minmax(0,1fr)] gap-4">
              <svg viewBox="0 0 100 100" className="w-[5.5rem] rounded-xl border border-white/20 bg-white/5" aria-hidden style={{ direction: "ltr" }}>
                <rect x="4" y="3" width="92" height="94" rx="3" fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="0.9" />
                <line x1="4" y1="50" x2="96" y2="50" stroke="rgba(255,255,255,.35)" strokeWidth="0.9" />
                {slots.map((s) => <circle key={s.slot} cx={s.x} cy={(8 + ((s.y - 16) * 86) / 76).toFixed(1)} r="4.4" fill={s.role === 'GK' ? '#3DAF2C' : '#fff'} />)}
              </svg>
              <div>
                <p className="font-display text-lg font-extrabold">{styleLabel}</p>
                <p className="mt-1 text-sm leading-relaxed text-white/85" data-style-desc>{t(`styleDesc_${plan.style}`)}</p>
                <p className="mt-2 text-xs text-white/70">{t(`styleKeys_${plan.style}`)}</p>
                <ul className="mt-3 flex flex-wrap gap-2 text-xs">
                  {(['DF', 'MF', 'FW'] as const).filter((r) => lines[r]).map((r) => <li key={r} className="rounded-full bg-white/10 px-3 py-1"><b className="me-1 text-base text-[#7fe06b]">{lines[r]}</b>{t(`line_${r}`)}</li>)}
                </ul>
              </div>
            </div>
          </div>


          <div data-drop="pool" className={`grid gap-2 rounded-card border border-line bg-raised p-4 ${zone('pool')}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-lg font-extrabold">{t('available')} <span className="text-sm font-semibold text-muted">({pool.length})</span></h3>
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchPlayer')} aria-label={t('searchPlayer')} className="min-h-10 w-full max-w-[14rem] rounded-full border border-line bg-raised px-3 text-sm" />
            </div>
              <div className="grid gap-2 rounded-card bg-surface p-3" data-rsvp={`${replies.yes}/${replies.maybe}/${replies.no}/${replies.pending}`}>
              <p className="flex flex-wrap items-baseline justify-between gap-2 text-xs font-bold uppercase tracking-widest text-muted"><span>{t('availability')}</span><span className="normal-case tracking-normal">{t('canPlay', { count: replies.yes + replies.maybe, total: roster.length })}</span></p>
              <div className="flex h-2.5 overflow-hidden rounded-full bg-line" aria-hidden>
                {(['yes', 'maybe', 'no'] as const).map((r) => <i key={r} className={r === 'yes' ? 'bg-accent' : r === 'maybe' ? 'bg-fg' : 'bg-danger'} style={{ width: `${(replies[r] * 100) / Math.max(1, roster.length)}%` }} />)}
              </div>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('filterReply')}>
                {(['all', 'yes', 'maybe', 'no', 'pending'] as const).map((r) => (
                  <button key={r} type="button" onClick={() => setReplyFilter(r)} aria-pressed={replyFilter === r} data-reply-filter={r}
                    className={`min-h-9 rounded-full px-3 text-xs font-bold ${replyFilter === r ? 'bg-fg text-raised' : 'border border-line'}`}>{r === 'all' ? t('all') : t(`reply_${r}`)} {r === 'all' ? roster.length : replies[r]}</button>
                ))}
              </div>
              {noReply.length ? <button type="button" onClick={() => copy(reminder, 'reminderCopied')} data-copy-reminder className="min-h-10 justify-self-start rounded-full border-2 border-fg px-4 text-sm font-bold hover:bg-fg hover:text-raised">{t('copyReminder', { count: noReply.length })}</button> : null}
            </div>
            <div className="flex flex-wrap gap-1" role="group" aria-label={t('filterRole')}>
              {(['all', ...ROLES] as const).map((r) => <button key={r} type="button" onClick={() => setRoleFilter(r)} aria-pressed={roleFilter === r} className={`min-h-9 rounded-full px-3 text-xs font-bold ${roleFilter === r ? 'bg-fg text-raised' : 'border border-line'}`}>{r === 'all' ? t('all') : t(`role_${r}`)}</button>)}
            </div>
            {selected !== null ? <p className="text-sm font-semibold text-pitch" role="status">{t('pickFor', { role: t(`role_${slots.find((s) => s.slot === selected)?.role ?? 'MF'}`) })}</p> : null}
            <ul className="grid max-h-[32rem] gap-2 overflow-y-auto pe-1">
              {pool.map((p) => (
                <li key={p.id} data-pool={p.id} onPointerDown={(e) => onDown(e, { id: p.id, from: 'pool' })}
                  className={`grid select-none grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-2 rounded-card border px-2 py-2 text-sm ${p.reply === 'no' ? 'border-danger/30 bg-danger/5' : 'border-line'} ${locked ? '' : 'cursor-grab'}`}>
                  {locked ? <span /> : <span data-handle aria-hidden className="cursor-grab touch-none px-1 text-lg leading-none text-muted">⋮⋮</span>}
                  <Avatar p={p} />
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-1.5"><b dir="ltr">{p.shirt ?? '–'}</b><bdi className="truncate font-semibold">{p.name}</bdi><ReplyChip p={p} /></p>
                    <p className="text-xs text-muted" data-player-info>
                      {[p.role, p.role2].filter(Boolean).map((r) => t(`role_${r}`)).join(' / ') || '–'}
                      {' · '}{p.attendance === null ? t('noAttendanceShort') : t('attendanceShort', { rate: p.attendance })}
                      {' · '}{t('seasonMinutes', { minutes: p.seasonMinutes, matches: p.seasonMatches })}
                      {p.note ? <> · “<bdi>{p.note}</bdi>”</> : null}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {locked ? null : <>
                        <button type="button" onClick={() => start(p.id)} disabled={selected === null && count >= slots.length} className="min-h-8 rounded-full bg-accent px-3 text-xs font-bold text-on-accent disabled:opacity-50">{t('start')}</button>
                        <button type="button" onClick={() => toBench(p.id)} disabled={subs.length >= 12} className="min-h-8 rounded-full border border-line px-3 text-xs font-bold hover:border-accent disabled:opacity-50">{t('toBench')}</button>
                      </>}
                      {p.phone ? <>
                        <a href={`tel:${p.phone}`} aria-label={`${t('call')} ${p.name}`} className="inline-flex min-h-8 items-center rounded-full border border-line px-3 text-xs font-bold hover:border-accent">{t('call')}</a>
                        <a href={`https://wa.me/${waDigits(p.phone)}`} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp ${p.name}`} className="inline-flex min-h-8 items-center rounded-full border border-line px-3 text-xs font-bold hover:border-accent">WhatsApp</a>
                      </> : null}
                    </div>
                  </div>
                </li>
              ))}
              {pool.length === 0 ? <li className="text-sm text-muted">{t('poolEmpty')}</li> : null}
            </ul>
          </div>
        </aside>
      </div>

      {/* ===== instructions and plan for the players ===== */}
      <details className="rounded-card border border-line bg-raised p-4" open data-instructions>
        <summary className="cursor-pointer font-display font-extrabold">{t('instructions')}</summary>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          {([['line', LINES], ['press', PRESSING], ['width', WIDTHS], ['tempo', TEMPOS]] as const).map(([k, opts]) => (
            <label key={k} className="grid gap-1 text-sm font-semibold">{t(`ins_${k}`)}
              <select value={plan[k]} disabled={locked} onChange={(e) => { setPlan((x) => ({ ...x, [k]: e.target.value })); touch(); }} data-ins={k} className="min-h-11 rounded-control border border-line bg-raised px-3">
                {opts.map((o) => <option key={o} value={o}>{t(`opt_${k}_${o}`)}</option>)}
              </select></label>
          ))}
        </div>
        <label className="mt-3 grid gap-1 text-sm font-semibold">{t('gamePlan')}
          <textarea value={plan.text} disabled={locked} onChange={(e) => { setPlan((x) => ({ ...x, text: e.target.value.slice(0, 2000) })); touch(); }} rows={3} maxLength={2000} placeholder={t('gamePlanEg')} data-plan-text className="rounded-control border border-line bg-raised p-3" />
          <span className="text-xs font-normal text-muted">{t('gamePlanNote')}</span></label>
      </details>

      {/* ===== rotation plan ===== */}
      <section className="rounded-card border border-line bg-raised p-4" aria-labelledby="rot-h" data-rotation>
        <h3 id="rot-h" className="font-display text-lg font-extrabold">{t('rotationTitle')}</h3>
        <p className="text-sm text-muted">{t('rotationLead', { minutes: length })}</p>
        {locked ? null : (
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-xs font-semibold">{t('minute')}
              <select value={rotMin} onChange={(e) => setRotMin(Number(e.target.value))} name="rot_min" className="min-h-10 rounded-control border border-line bg-raised px-2">
                {Array.from({ length: Math.floor((length - 1) / 5) }, (_, i) => (i + 1) * 5).map((m) => <option key={m} value={m}>{m}&apos;</option>)}</select></label>
            <label className="grid gap-1 text-xs font-semibold">{t('evPlayerOff')}
              <select value={rotOff || plannedOffOptions[0] || ''} onChange={(e) => setRotOff(e.target.value)} name="rot_off" className="min-h-10 max-w-[11rem] rounded-control border border-line bg-raised px-2">
                {plannedOffOptions.map((id) => <option key={id} value={id}>{byId.get(id)?.name}</option>)}</select></label>
            <label className="grid gap-1 text-xs font-semibold">{t('evPlayerOn')}
              <select value={rotOn || plannedOnOptions[0] || ''} onChange={(e) => setRotOn(e.target.value)} name="rot_on" className="min-h-10 max-w-[11rem] rounded-control border border-line bg-raised px-2">
                {plannedOnOptions.map((id) => <option key={id} value={id}>{byId.get(id)?.name}</option>)}</select></label>
            <button type="button" onClick={addRotation} disabled={!plannedOffOptions.length || !plannedOnOptions.length} data-add-rotation className="min-h-10 rounded-full border-2 border-fg px-4 text-sm font-bold hover:bg-fg hover:text-raised disabled:opacity-50">{t('addChange')}</button>
          </div>
        )}
        {sim.sorted.length ? (
          <ul className="mt-3 flex flex-wrap gap-2">
            {sim.sorted.map((r, i) => (
              <li key={`${r.on}-${r.minute}`} data-planned={r.on} className={`flex items-center gap-2 rounded-full border px-3 py-1 text-sm ${sim.ok[i] ? 'border-line' : 'border-danger/40 text-danger line-through'}`}>
                <b dir="ltr">{r.minute}&apos;</b><bdi>{byId.get(r.off)?.name}</bdi> → <bdi className="font-semibold">{byId.get(r.on)?.name}</bdi>
                {locked ? null : <button type="button" onClick={() => { setRotation((x) => x.filter((y) => y !== r)); touch(); }} aria-label={t('remove')} className="text-muted hover:text-danger">✕</button>}
              </li>
            ))}
          </ul>
        ) : null}
        {count ? (
          <div className="mt-4 grid gap-1.5" data-minutes>
            <p className="text-xs font-bold uppercase tracking-widest text-muted">{t('plannedMinutes')}</p>
            {[...Object.values(starters), ...subs].map((id) => byId.get(id)).filter((p): p is BoardPlayer => !!p)
              .map((p) => ({ p, m: sim.minutes(p.id) })).sort((a, b) => b.m - a.m || (a.p.shirt ?? 99) - (b.p.shirt ?? 99)).map(({ p, m }) => (
                <div key={p.id} className="grid grid-cols-[minmax(6rem,30%)_minmax(0,1fr)_3rem_5.5rem] items-center gap-2 text-xs" data-minutes-row={p.id} data-minutes-value={m}>
                  <bdi className="truncate font-semibold">{p.shirt ? `#${p.shirt} ` : ''}{p.name}</bdi>
                  <span className="block h-2 overflow-hidden rounded-full bg-line"><i className={`block h-full rounded-full ${m ? 'bg-accent' : ''}`} style={{ width: `${(m * 100) / length}%` }} /></span>
                  <b className="text-end tabular-nums" dir="ltr">{m}&apos;</b>
                  <span className="text-end text-muted">{t('seasonShort', { minutes: p.seasonMinutes })}</span>
                </div>
              ))}
          </div>
        ) : null}
      </section>

      {/* ===== checks, export, save ===== */}
      <div className="grid gap-4 md:grid-cols-2">
        <ul className="grid content-start gap-1.5 rounded-card border border-line bg-raised p-4" aria-label={t('checks')} data-checks>
          {checks.map((c) => <li key={c.key} data-check={c.key} data-ok={c.ok} className={`flex gap-2 text-sm ${c.ok ? 'text-pitch' : 'text-danger'}`}><span aria-hidden>{c.ok ? '✓' : '!'}</span><span>{c.text}</span></li>)}
        </ul>
        <div className="grid content-start gap-2 rounded-card border border-line bg-raised p-4">
          <p className="text-xs font-bold uppercase tracking-widest text-muted">{t('shareTitle')}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => doExport('share')} disabled={!!busy} data-export="share" className="min-h-11 rounded-full bg-accent px-4 text-sm font-bold text-on-accent hover:brightness-110 disabled:opacity-60">{t('shareImage')}</button>
            <button type="button" onClick={() => doExport('video')} disabled={!!busy} data-export="video" className="min-h-11 rounded-full border-2 border-fg px-4 text-sm font-bold hover:bg-fg hover:text-raised disabled:opacity-60">{busy === 'video' ? t('recording') : t('videoClip')}</button>
            <button type="button" onClick={() => doExport('png')} disabled={!!busy} data-export="png" className="min-h-11 rounded-full border border-line px-4 text-sm font-semibold hover:border-accent">PNG</button>
            <button type="button" onClick={() => doExport('jpg')} disabled={!!busy} data-export="jpg" className="min-h-11 rounded-full border border-line px-4 text-sm font-semibold hover:border-accent">JPG</button>
            <button type="button" onClick={() => copy(asText())} data-copy-lineup className="min-h-11 rounded-full border border-line px-4 text-sm font-semibold hover:border-accent">{t('copyText')}</button>
          </div>
          <p className="text-xs text-muted">{t('shareNote')}</p>
          <p aria-live="polite" className="min-h-5 text-sm font-semibold text-pitch" data-board-msg>{msg}</p>
        </div>
      </div>

      {locked ? <p role="status" className="rounded-card bg-surface p-3 text-sm">{t('lineupLockedNote')}</p> : (
        <form action={saveLineup} onSubmit={() => { dirty.current = false; }} className="sticky bottom-2 z-10 flex flex-wrap items-center gap-3 rounded-card bg-raised/95 p-2 shadow-lg">
          <input type="hidden" name="match_id" value={matchId} /><input type="hidden" name="back" value={back} />
          <input type="hidden" name="formation" value={formation} />
          <input type="hidden" name="starters" value={JSON.stringify(Object.entries(starters).map(([slot, player]) => ({ slot: Number(slot), player })))} />
          <input type="hidden" name="subs" value={JSON.stringify(subs)} /><input type="hidden" name="captain" value={captain ?? ''} />
          <input type="hidden" name="rotation" value={JSON.stringify(sim.sorted.filter((_, i) => sim.ok[i]))} />
          <input type="hidden" name="plan" value={JSON.stringify(plan)} />
          <button className="min-h-12 flex-1 rounded-full bg-accent px-6 font-display font-bold text-on-accent hover:brightness-110" data-save-board>{t('saveBoard')}</button>
        </form>
      )}

      {ghost ? (
        <div className="pointer-events-none fixed z-50 flex -translate-x-1/2 -translate-y-[60%] items-center gap-2 rounded-full bg-ink-950 px-4 py-2 text-sm font-bold text-white shadow-xl" style={{ left: ghost.x, top: ghost.y }} aria-hidden data-ghost>
          {ghost.label}
        </div>
      ) : null}
    </div>
  );
}
