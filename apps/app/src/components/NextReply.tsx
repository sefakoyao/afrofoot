'use client';

import { useActionState } from 'react';
import { replyToEvent, type ReplyState } from '@/app/actions/replies';

type Availability = 'pending' | 'yes' | 'no' | 'maybe';
const IDLE: ReplyState = { status: 'idle' };

/**
 * The one-tap answer on the "Next up" card of the player's home (Alternative A): I'm in / Maybe / Can't, on the black
 * card. Saves in place (replyToEvent, the same rules as the calendar: closes at the deadline); the chosen answer is filled.
 */
export function NextReply({ eventId, kind, availability, labels }: {
  eventId: string; kind: string; availability: Availability;
  labels: { yes: string; maybe: string; no: string; group: string; saved: string; error: string };
}) {
  const [state, action, pending] = useActionState(replyToEvent, IDLE);
  const cur: Availability = state.status === 'ok' && state.answer ? state.answer : availability;
  const btn = (k: Exclude<Availability, 'pending'>) => {
    const on = cur === k;
    const fill = k === 'yes' ? 'bg-accent text-on-accent' : k === 'maybe' ? 'bg-gold text-ink-950' : 'bg-danger text-white';
    return `flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-full px-2 font-display text-[15px] font-extrabold transition active:scale-[.97] disabled:opacity-60 ${on ? fill : 'border-2 border-white/25 bg-white/10 text-white hover:border-white/60'}`;
  };
  const icon = { yes: 'm5 12 5 5 9-10', maybe: 'M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01', no: 'M6 6l12 12M18 6 6 18' } as const;
  return (
    <form action={action} className="grid gap-2" data-next-reply={cur}>
      <input type="hidden" name="event_id" value={eventId} /><input type="hidden" name="kind" value={kind} />
      <div className="flex gap-2" role="group" aria-label={labels.group}>
        {(['yes', 'maybe', 'no'] as const).map((k) => (
          <button key={k} name="answer" value={k} aria-pressed={cur === k} disabled={pending} className={btn(k)} data-answer={k}>
            <svg viewBox="0 0 24 24" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={icon[k]} /></svg>
            {labels[k]}
          </button>
        ))}
      </div>
      {state.status !== 'idle' ? <p role={state.status === 'ok' ? 'status' : 'alert'} className={`text-sm font-semibold ${state.status === 'ok' ? 'text-accent' : 'text-white'}`}>{state.status === 'ok' ? labels.saved : labels.error}</p> : null}
    </form>
  );
}
