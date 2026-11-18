import { getLocale, getTranslations } from 'next-intl/server';
import { LOCALE_LABELS, TIME_ZONE, isLocale } from '@afrofoot/i18n';
import { setReplyBy } from '@/app/actions/coach';

/**
 * "Players reply by …" with a date and time the coach can change (migration 0048). Set automatically when the event is
 * made: trainings the day before at 20:00, games two days before at 20:00. Email reminders follow this deadline.
 */
export async function ReplyByForm({ kind, id, replyBy, back }: { kind: 'training' | 'game'; id: string; replyBy: string | null; back: string }) {
  const [t, raw] = await Promise.all([getTranslations('coach'), getLocale()]);
  const tag = isLocale(raw) ? LOCALE_LABELS[raw].intl : 'en-GB';
  const date = replyBy ? new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date(replyBy)) : '';
  const time = replyBy ? new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: TIME_ZONE }).format(new Date(replyBy)) : '20:00';
  const label = replyBy ? new Intl.DateTimeFormat(tag, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: TIME_ZONE }).format(new Date(replyBy)) : '–';
  return (
    <details className="mt-3 rounded-control bg-surface p-3 text-sm" data-reply-by-form>
      <summary className="cursor-pointer"><span className="text-muted">{t('replyByLabel')}</span> <b data-reply-by-value>{label}</b> · <span className="font-semibold text-pitch underline underline-offset-2">{t('change')}</span></summary>
      <form action={setReplyBy} className="mt-3 flex flex-wrap items-end gap-2">
        <input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={id} /><input type="hidden" name="back" value={back} />
        <label className="grid gap-1 font-semibold">{t('date')}<input type="date" name="date" required defaultValue={date} className="min-h-10 rounded-control border border-line bg-raised px-2" /></label>
        <label className="grid gap-1 font-semibold">{t('time')}<input type="time" name="time" required defaultValue={time} className="min-h-10 rounded-control border border-line bg-raised px-2" /></label>
        <button className="min-h-10 rounded-full bg-accent px-4 font-display font-bold text-on-accent hover:brightness-110">{t('save')}</button>
      </form>
      <p className="mt-2 text-xs text-muted">{t('replyByHint')}</p>
    </details>
  );
}
