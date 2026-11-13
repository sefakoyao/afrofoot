'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

export type Labels = Record<string, string>;

const input = 'w-full rounded-control border border-line bg-raised px-3 py-2 text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/30';

export function Field({ label, required, hint, wide, children }: { label: string; required?: boolean; hint?: string; wide?: boolean; children: ReactNode }) {
  return (
    <label className={`grid gap-1 text-sm font-semibold ${wide ? 'sm:col-span-2' : ''}`}>
      <span>{label}{required ? ' *' : ''}</span>
      {children}
      {hint ? <small className="font-normal text-muted">{hint}</small> : null}
    </label>
  );
}

export const TextInput = (p: React.InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={`${input} ${p.className ?? ''}`} />;
export const TextArea = (p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={`${input} ${p.className ?? ''}`} />;
export const Select = (p: React.SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={`${input} ${p.className ?? ''}`} />;

/** Keeps only "+" (first position) and digits and spaces, and starts the value with "+". Validation happens on the server too. */
export function PhoneInput({ name, labels, required, defaultValue }: { name: string; labels: Labels; required?: boolean; defaultValue?: string }) {
  const [v, setV] = useState(defaultValue ?? '');
  const clean = (raw: string) => {
    const digits = raw.replace(/[^\d ]/g, '').replace(/^ +/, '');
    return digits || raw.includes('+') ? `+${digits}` : '';
  };
  const bad = v !== '' && v !== '+' && !/^\+[1-9][\d ]{5,}$/.test(v);
  return (
    <>
      <TextInput name={name} type="tel" inputMode="tel" autoComplete="tel" required={required} value={v} placeholder="+358 40 123 4567"
        onChange={(e) => setV(clean(e.target.value))} onFocus={() => setV((x) => x || '+')} aria-invalid={bad} />
      <small className={bad ? 'font-normal text-danger' : 'font-normal text-muted'}>{bad ? labels.ph_err : labels.ph_hint}</small>
    </>
  );
}

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

/**
 * Calendar date picker with a month and year selector and arrows, readable in light and dark.
 * Submits the date as YYYY-MM-DD through a hidden input. `locale` is the BCP-47 tag used for month and weekday names.
 */
export function DatePicker({ name, labels, locale, required, onChange, minYear = 1960 }: {
  name: string; labels: Labels; locale: string; required?: boolean; onChange?: (iso: string) => void; minYear?: number;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const today = new Date();
  const maxYear = today.getFullYear() - 5;
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(Math.min(maxYear, today.getFullYear() - 18));
  const [month, setMonth] = useState(0);

  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', off); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc); };
  }, [open]);

  const fmt = new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' });
  const months = Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(Date.UTC(2024, i, 1)));
  const weekdays = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone: 'UTC' }).format(Date.UTC(2024, 0, 1 + i))); // 1 Jan 2024 is a Monday
  const lead = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const years = Array.from({ length: maxYear - minYear + 1 }, (_, i) => maxYear - i);
  const limit = today.getTime() - 5 * 365 * 86_400_000;

  const go = (delta: number) => {
    const d = new Date(Date.UTC(year, month + delta, 1));
    if (d.getUTCFullYear() > maxYear || d.getUTCFullYear() < minYear) return;
    setYear(d.getUTCFullYear()); setMonth(d.getUTCMonth());
  };
  const pick = (v: string) => { setValue(v); onChange?.(v); setOpen(false); };

  return (
    <div ref={root} className="relative">
      <input type="hidden" name={name} value={value} />
      <button type="button" id={id} className={`${input} flex items-center justify-between text-start`} aria-haspopup="dialog" aria-expanded={open}
        aria-required={required} onClick={() => setOpen((o) => !o)}>
        <span className={value ? '' : 'text-muted'}>{value ? fmt.format(new Date(`${value}T00:00:00Z`)) : labels.dp_open}</span>
        <span aria-hidden>▾</span>
      </button>
      {open ? (
        <div role="dialog" aria-label={labels.dp_open} className="absolute z-30 mt-2 w-80 max-w-[92vw] rounded-card bg-ink-950 p-3 text-white shadow-2xl">
          <div className="mb-2 flex items-center gap-1">
            <button type="button" aria-label={labels.dp_prev} onClick={() => go(-1)} className="rounded-full px-3 py-1 text-lg hover:bg-white/15">‹</button>
            <select aria-label={labels.dp_month} value={month} onChange={(e) => setMonth(Number(e.target.value))} className="min-w-0 flex-1 rounded-control bg-white/10 px-2 py-1 text-white">
              {months.map((m, i) => <option key={m} value={i} className="text-black">{m}</option>)}
            </select>
            <select aria-label={labels.dp_year} value={year} onChange={(e) => setYear(Number(e.target.value))} className="rounded-control bg-white/10 px-2 py-1 text-white">
              {years.map((y) => <option key={y} value={y} className="text-black">{y}</option>)}
            </select>
            <button type="button" aria-label={labels.dp_next} onClick={() => go(1)} className="rounded-full px-3 py-1 text-lg hover:bg-white/15">›</button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-white/60">{weekdays.map((w, i) => <span key={i}>{w}</span>)}</div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} />)}
            {Array.from({ length: days }, (_, i) => {
              const d = i + 1; const v = iso(year, month, d);
              const off = Date.UTC(year, month, d) > limit;
              return (
                <button key={d} type="button" disabled={off} onClick={() => pick(v)} aria-pressed={v === value}
                  className={`rounded-full py-1.5 text-sm ${v === value ? 'bg-accent font-bold text-on-accent' : 'hover:bg-white/15'} disabled:opacity-30`}>{d}</button>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between text-sm">
            <button type="button" className="px-2 py-1 text-accent hover:underline" onClick={() => { setValue(''); onChange?.(''); setOpen(false); }}>{labels.dp_clear}</button>
            <button type="button" className="px-2 py-1 hover:underline" onClick={() => setOpen(false)}>{labels.dp_close}</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function SubmitRow({ pending, label, children }: { pending: boolean; label: string; children?: ReactNode }) {
  return (
    <div className="mt-4 flex flex-wrap gap-3">
      {children}
      <button type="submit" disabled={pending} className="rounded-full bg-accent px-6 py-2.5 font-display font-bold text-on-accent hover:brightness-110 disabled:opacity-60">{label}</button>
    </div>
  );
}

export function Check({ name, label, required }: { name: string; label: string; required?: boolean }) {
  return (
    <label className="mt-3 flex items-start gap-2 text-sm">
      <input type="checkbox" name={name} required={required} className="mt-1 size-4 accent-[rgb(var(--accent))]" />
      <span>{label}{required ? ' *' : ''}</span>
    </label>
  );
}

/** Honeypot: hidden from people, filled by bots. The server drops submissions that fill it. */
export const Honeypot = () => <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-0 w-0 opacity-0" />;

export function Result({ state, labels, okKey }: { state: { status: string; error?: string }; labels: Labels; okKey: string }) {
  if (state.status === 'ok') return <p role="status" className="mt-4 rounded-card bg-accent/15 p-4 font-semibold text-pitch">{labels[okKey]}</p>;
  if (state.status === 'error') return <p role="alert" className="mt-4 rounded-card bg-danger/10 p-3 text-sm font-semibold text-danger">{labels[state.error ?? 'tr_e_req'] ?? labels.tr_e_req}</p>;
  return null;
}
