'use client';

import { useActionState } from 'react';
import { replyAsCoach, type CoachReplyState } from '@/app/actions/coachReplies';

type Answer = 'yes' | 'maybe' | 'no';
const IDLE: CoachReplyState = { status: 'idle' };
const ICON = { yes: 'm5 12 5 5 9-10', maybe: 'M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01', no: 'M6 6l12 12M18 6 6 18' } as const;

/** A coach's own I'm in / Maybe / Can't for one event (Coach home), saved in place; the chosen answer is filled. */
export function CoachReply({ kind, eventId, mine, labels }: {
  kind: 'practice' | 'match' | 'event'; eventId: string; mine: Answer | null;
  labels: { yes: string; maybe: string; no: string; group: string; saved: string; closed: string; error: string; notInstalled: string };
}) {
  const [state, action, pending] = useActionState(replyAsCoach, IDLE);
  const cur = state.status === 'ok' && state.answer ? state.answer : mine;
  const on: Record<Answer, string> = { yes: 'border-accent bg-accent text-on-accent', maybe: 'border-gold bg-gold text-ink-950', no: 'border-danger bg-danger text-white' };
  return (
    <form action={action} className="grid gap-1" data-coach-reply={cur ?? 'none'}>
      <input type="hidden" name="kind" value={kind} /><input type="hidden" name="event_id" value={eventId} />
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={labels.group}>
        {(['yes', 'maybe', 'no'] as const).map((k) => (
          <button key={k} name="answer" value={k} aria-pressed={cur === k} disabled={pending} data-answer={k}
            className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border-2 px-3.5 text-sm font-bold transition active:scale-[.97] disabled:opacity-60 ${cur === k ? on[k] : 'border-line bg-raised hover:border-accent'}`}>
            <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={ICON[k]} /></svg>{labels[k]}
          </button>
        ))}
      </div>
      {state.status === 'ok' ? <p role="status" className="text-xs font-semibold text-pitch">{labels.saved}</p> : null}
      {state.status === 'error' ? <p role="alert" className="text-xs font-semibold text-danger">{state.key === 'r_closed' ? labels.closed : state.key === 'r_notInstalled' ? labels.notInstalled : labels.error}</p> : null}
    </form>
  );
}
