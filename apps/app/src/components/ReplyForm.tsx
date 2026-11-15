'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { replyToEvent, type ReplyState } from '@/app/actions/replies';

type Availability = 'pending' | 'yes' | 'no' | 'maybe';
const STYLE: Record<Availability, string> = { yes: 'bg-accent/20 text-pitch', no: 'bg-danger/10 text-danger', maybe: 'bg-line text-fg', pending: 'bg-line text-muted' };
const IDLE: ReplyState = { status: 'idle' };

/** Sign in / out of one event (Calendar tab). Saves in place and confirms next to the event; works without JavaScript too. */
export function ReplyForm({ eventId, kind, availability, note, eventLabel }: { eventId: string; kind: string; availability: Availability; note: string | null; eventLabel: string }) {
  const t = useTranslations('me');
  const tav = useTranslations('availability');
  const [state, action, pending] = useActionState(replyToEvent, IDLE);
  const cur: Availability = state.status === 'ok' && state.answer ? state.answer : availability;
  const curNote = state.status === 'ok' ? state.note ?? '' : note ?? '';
  const btn = (on: boolean, tone: 'in' | 'out') => `inline-flex min-h-11 items-center rounded-full px-5 font-display font-bold disabled:opacity-60 ${on
    ? (tone === 'in' ? 'bg-accent text-on-accent' : 'bg-danger text-white')
    : 'border-2 border-line bg-raised hover:border-fg'}`;
  return (
    <form action={action} className="mt-2 grid gap-2 border-t border-line pt-3" data-reply={cur}>
      <input type="hidden" name="event_id" value={eventId} /><input type="hidden" name="kind" value={kind} />
      <p className="text-sm font-semibold">{t('yourReply')}: <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STYLE[cur]}`} data-reply-state={cur}>{cur === 'pending' ? t('noReply') : tav(cur)}</span></p>
      <div className="flex flex-wrap gap-2" role="group" aria-label={`${t('yourReply')}: ${eventLabel}`}>
        <button name="answer" value="yes" aria-pressed={cur === 'yes'} disabled={pending} className={btn(cur === 'yes', 'in')}>✓ {t('imIn')}</button>
        <button name="answer" value="no" aria-pressed={cur === 'no'} disabled={pending} className={btn(cur === 'no', 'out')}>✕ {t('imOut')}</button>
      </div>
      <label className="grid gap-1 text-sm">{t('replyNote')}
        <input key={curNote} name="note" maxLength={300} defaultValue={curNote} placeholder={t('replyNoteEg')} className="min-h-11 rounded-control border border-line bg-raised px-3" /></label>
      {state.key ? (
        <p role={state.status === 'ok' ? 'status' : 'alert'} data-reply-result={state.status} className={`rounded-card p-2 text-sm font-semibold ${state.status === 'ok' ? 'bg-accent/15 text-pitch' : 'bg-danger/10 text-danger'}`}>
          {t(state.key as 'r_signedIn')}
        </p>
      ) : null}
    </form>
  );
}
