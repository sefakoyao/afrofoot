'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { addMatchEvent, matchPhase } from '@/app/actions/match';
import { NEXT_PHASE, matchMinute, type LiveState, type PhaseTimes } from '@/lib/match';

interface P { id: string; name: string }
interface Props {
  matchId: string; back: string; team: string; opponent: string; homeAway: 'home' | 'away';
  state: LiveState; times: PhaseTimes; score: { us: number; them: number };
  onPitch: P[]; benchLeft: P[]; squad: P[]; disabled: boolean;
  planned?: { minute: number; off: P; on: P }[];
}
const TYPES = ['goal', 'penalty_scored', 'own_goal', 'penalty_missed', 'yellow_card', 'second_yellow', 'red_card', 'substitution', 'injury', 'note'] as const;
type T = (typeof TYPES)[number];
const input = 'min-h-11 w-full rounded-control border border-line bg-raised px-3';

/** Live scoreboard and event entry. The clock runs from the time each half was started here; the score is kept by the database. */
export function LiveConsole({ matchId, back, team, opponent, homeAway, state, times, score, onPitch, benchLeft, squad, disabled, planned = [] }: Props) {
  const t = useTranslations('match');
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [type, setType] = useState<T>('goal');
  const [side, setSide] = useState<'us' | 'opponent'>('us');
  const [pick, setPick] = useState<{ on: string; off: string } | null>(null);
  const live = state === 'first_half' || state === 'second_half' || state === 'half_time';
  useEffect(() => {
    if (!live) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const sync = setInterval(() => router.refresh(), 20000); // other coaches may be entering events too
    return () => { clearInterval(tick); clearInterval(sync); };
  }, [live, router]);
  const clock = matchMinute(state, times, now);
  const next = NEXT_PHASE[state];
  const ours = side === 'us';
  const needsPlayer = ours && type !== 'note';
  const players = type === 'substitution' ? benchLeft : onPitch;
  const quick = (ty: T, si: 'us' | 'opponent') => { setType(ty); setSide(si); setPick(null); };
  const [home, away] = homeAway === 'home' ? [[team, score.us], [opponent, score.them]] as const : [[opponent, score.them], [team, score.us]] as const;

  return (
    <div className="grid gap-4">
      <div className="rounded-card bg-ink-950 p-4 text-white" data-scoreboard aria-live="polite">
        <div className="flex items-center justify-between gap-2 text-xs font-bold uppercase tracking-widest text-white/70">
          <span>{t(`state_${state}`)}</span>
          {live ? <span className="flex items-center gap-1.5" data-clock><span className="size-2 animate-pulse rounded-full bg-accent" aria-hidden />{clock.label}</span> : null}
        </div>
        <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <p className="truncate text-end font-display text-lg font-extrabold"><bdi>{home[0]}</bdi></p>
          <p className="font-display text-5xl font-black tabular-nums" dir="ltr" data-score={`${score.us}-${score.them}`}>{home[1]}<span className="mx-2 text-white/50">–</span>{away[1]}</p>
          <p className="truncate font-display text-lg font-extrabold"><bdi>{away[0]}</bdi></p>
        </div>
      </div>

      {next && !disabled ? (
        <form action={matchPhase}>
          <input type="hidden" name="match_id" value={matchId} /><input type="hidden" name="back" value={back} /><input type="hidden" name="phase" value={next} />
          <input type="hidden" name="minute" value={clock.minute} /><input type="hidden" name="added_minute" value={clock.added} />
          <button data-phase={next} className="min-h-14 w-full rounded-full bg-accent px-6 font-display text-lg font-black text-on-accent hover:brightness-110">{t(`phase_${next}`)}</button>
        </form>
      ) : null}

      {state !== 'not_started' && state !== 'full_time' && !disabled ? (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="group" aria-label={t('quick')}>
            {([['goal', 'us', '⚽ ' + t('q_goalUs')], ['goal', 'opponent', '⚽ ' + t('q_goalThem')], ['substitution', 'us', '⇄ ' + t('q_sub')], ['yellow_card', 'us', '🟨 ' + t('q_yellow')], ['red_card', 'us', '🟥 ' + t('q_red')], ['note', 'us', '✎ ' + t('q_note')]] as const).map(([ty, si, label]) => (
              <button key={`${ty}-${si}`} type="button" onClick={() => quick(ty, si)} aria-pressed={type === ty && side === si} data-quick={`${ty}-${si}`}
                className={`min-h-12 rounded-card px-3 text-sm font-bold ${type === ty && side === si ? 'bg-fg text-raised' : 'border-2 border-line bg-raised hover:border-fg'}`}>{label}</button>
            ))}
          </div>
          {planned.length ? (
            <div className="rounded-card border border-line p-3" data-planned-live>
              <p className="text-xs font-bold uppercase tracking-widest text-muted">{t('plannedChanges')}</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {planned.map((r) => (
                  <li key={r.on.id}><button type="button" onClick={() => { setType('substitution'); setSide('us'); setPick({ on: r.on.id, off: r.off.id }); }} data-use-planned={r.on.id}
                    className={`min-h-11 rounded-full border-2 px-3 text-sm font-semibold ${clock.minute >= r.minute && live ? 'border-accent bg-accent/10' : 'border-line'}`}>
                    <b dir="ltr">{r.minute}&apos;</b> <bdi>{r.on.name}</bdi> ⇄ <bdi>{r.off.name}</bdi></button></li>
                ))}
              </ul>
            </div>
          ) : null}
          <form action={addMatchEvent} className="grid gap-3 rounded-card bg-surface p-4 sm:grid-cols-2" data-event-form>
            <input type="hidden" name="match_id" value={matchId} /><input type="hidden" name="back" value={back} />
            <label className="grid gap-1 text-sm font-semibold">{t('evType')}
              <select name="type" value={type} onChange={(e) => setType(e.target.value as T)} className={input}>{TYPES.map((x) => <option key={x} value={x}>{t(`ev_${x}`)}</option>)}</select></label>
            <fieldset className="grid gap-1"><legend className="text-sm font-semibold">{t('evSide')}</legend>
              <div className="flex gap-2">
                {(['us', 'opponent'] as const).map((s) => (
                  <label key={s} className="relative"><input type="radio" name="side" value={s} checked={side === s} onChange={() => setSide(s)} className="peer sr-only" />
                    <span className="flex min-h-11 cursor-pointer items-center rounded-full border-2 border-line px-4 font-bold peer-checked:border-fg peer-checked:bg-fg peer-checked:text-raised peer-focus-visible:ring-2 peer-focus-visible:ring-accent"><bdi>{s === 'us' ? team : opponent}</bdi></span></label>
                ))}
              </div>
            </fieldset>
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1 text-sm font-semibold">{t('evMinute')}<input key={`m-${clock.minute}`} name="minute" type="number" min={0} max={130} defaultValue={clock.minute} className={input} /></label>
              <label className="grid gap-1 text-sm font-semibold">{t('evAdded')}<input key={`a-${clock.added}`} name="added_minute" type="number" min={0} max={20} defaultValue={clock.added} className={input} /></label>
            </div>
            {needsPlayer ? (
              <label className="grid gap-1 text-sm font-semibold">{type === 'substitution' ? t('evPlayerOn') : t('evPlayer')}
                <select name="player_id" required defaultValue={type === 'substitution' ? pick?.on ?? '' : ''} className={input} key={`p-${type}-${pick?.on ?? ''}`}><option value="" disabled>{t('choose')}</option>{players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            ) : !ours && type !== 'note' ? (
              <label className="grid gap-1 text-sm font-semibold">{t('evOpponentPlayer')}<input name="opponent_label" maxLength={80} placeholder={t('evOpponentEg')} className={input} /></label>
            ) : null}
            {ours && type === 'substitution' ? (
              <label className="grid gap-1 text-sm font-semibold">{t('evPlayerOff')}
                <select name="player_out_id" required defaultValue={pick?.off ?? ''} className={input} key={`o-${pick?.off ?? ''}`}><option value="" disabled>{t('choose')}</option>{onPitch.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            ) : null}
            {ours && (type === 'goal' || type === 'penalty_scored') ? (
              <label className="grid gap-1 text-sm font-semibold">{t('evAssist')}
                <select name="assist_player_id" defaultValue="" className={input}><option value="">{t('none')}</option>{squad.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            ) : null}
            <label className="grid gap-1 text-sm font-semibold sm:col-span-2">{t('evNote')}<input name="note" maxLength={300} required={type === 'note'} className={input} /></label>
            <button data-add-event className="min-h-12 rounded-full bg-accent px-6 font-display font-bold text-on-accent hover:brightness-110 sm:col-span-2">{t('addEvent')}</button>
          </form>
        </>
      ) : null}
    </div>
  );
}
