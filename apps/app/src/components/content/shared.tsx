import { getTranslations } from 'next-intl/server';
import { NavIcon, type NavIconName } from '@/components/NavIcon';

/** Shared bits of the content assistant pages (migration 0064). */
export const KIND_ICON: Record<string, NavIconName> = { match_report: 'ball', match_preview: 'calendar', event: 'star', new_player: 'user', new_sponsor: 'handshake', monthly_recap: 'chart' };
export const input = 'min-h-10 w-full rounded-control border border-line bg-raised px-3 font-normal';
export const area = 'w-full rounded-control border border-line bg-raised p-3 font-normal leading-relaxed';
export const btn = 'min-h-10 rounded-full bg-accent px-5 font-display font-bold text-on-accent hover:brightness-110';

/** "2026-11-21T18:00" in Helsinki time, for a datetime-local field. */
export function toLocalInput(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : new Date(Date.now() + 3600000);
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Helsinki', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d).replace(' ', 'T');
}

export function KindBadge({ kind, label }: { kind: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-bold text-pitch" data-kind={kind}>
      <NavIcon name={KIND_ICON[kind] ?? 'star'} className="size-3.5" />{label}
    </span>
  );
}

const OK = ['c_drafted', 'c_saved', 'c_approved', 'c_rejected', 'c_published', 'c_draftSaved', 'c_settingsSaved', 'c_editorAdded', 'c_editorRemoved', 'c_noTopics'];
/** The result of the last action (?result=…), with its numbers. */
export async function ContentBanner({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const r = typeof sp.result === 'string' ? sp.result : '';
  if (!/^c_[A-Za-z]+$/.test(r)) return null;
  const t = await getTranslations('content');
  let msg: string;
  try { msg = t(r as 'c_saved', { count: Number(sp.n) || 0, left: Number(sp.left) || 0 }); } catch { return null; }
  const ok = OK.includes(r);
  return <p role={ok ? 'status' : 'alert'} className={`rounded-card p-3 font-semibold ${ok ? 'bg-accent/15 text-pitch' : 'bg-danger/10 text-danger'}`} data-content-result={r}>{msg}</p>;
}
