import { getTranslations } from 'next-intl/server';
import type { Season } from '@/lib/finance';

/** Season choice for the Finance pages: a plain GET form (works without JavaScript). */
export async function SeasonPicker({ seasons, current, label, action, keep = {} }: { seasons: Season[]; current: string; label: string; action: string; keep?: Record<string, string> }) {
  const t = await getTranslations('fin');
  return (
    <form action={action} className="flex items-end gap-2" data-season-picker>
      {Object.entries(keep).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <label className="grid gap-1 text-sm font-semibold">{label}
        <select name="season" defaultValue={current} className="min-h-10 rounded-control border border-line bg-raised px-3">
          {seasons.map((s) => <option key={s.id} value={s.id}>{s.name}{s.is_current ? ` · ${t('currentSeason')}` : ''}</option>)}
        </select></label>
      <button className="min-h-10 rounded-full border-2 border-fg px-4 text-sm font-bold hover:bg-fg hover:text-raised">{t('show')}</button>
    </form>
  );
}
