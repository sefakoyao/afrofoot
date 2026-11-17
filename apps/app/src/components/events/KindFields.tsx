'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

const input = 'min-h-11 w-full rounded-control border border-line bg-raised px-3';

/**
 * Event type and title. With `sport` (Admin → Events), the list starts with Training, Game (league) and Friendly game:
 * for a game the title becomes the opponent, with home / away and, for a league game, the division (required).
 */
export function KindFields({ kinds, sport, defaultKind }: { kinds: readonly string[]; sport: boolean; defaultKind: string }) {
  const t = useTranslations('events');
  const tm = useTranslations('match');
  const [kind, setKind] = useState(defaultKind);
  const game = kind === 'game' || kind === 'friendly';
  const option = (k: string) => <option key={k} value={k}>{t(`kind_${k}`)}</option>;
  return (
    <>
      <label className="grid gap-1 text-sm font-semibold">{t('kind')}
        <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className={input} data-event-kind>
          {sport ? (
            <>
              <optgroup label={t('kindGroupSport')}>{['training', 'game', 'friendly'].map(option)}</optgroup>
              <optgroup label={t('kindGroupOther')}>{kinds.map(option)}</optgroup>
            </>
          ) : kinds.map(option)}
        </select>
        {sport && (game || kind === 'training') ? <span className="text-xs font-normal text-muted" data-sport-hint>{t('sportTeamHint')}</span> : null}
      </label>
      <label className="grid gap-1 text-sm font-semibold">{game ? tm('opponent') : t('title')}
        <input name="title" required minLength={game ? 1 : 2} maxLength={120} key={game ? 'opp' : 'title'}
          placeholder={game ? t('opponentEg') : kind === 'training' ? t('trainingTitleEg') : t('titleEg')} className={input} /></label>
      {game ? (
        <>
          <label className="grid gap-1 text-sm font-semibold">{tm('homeAway')}
            <select name="home_away" defaultValue="home" className={input}><option value="home">{tm('home')}</option><option value="away">{tm('away')}</option></select></label>
          <label className="grid gap-1 text-sm font-semibold">{tm('division')}
            <input name="division" maxLength={60} required={kind === 'game'} placeholder={t('divisionEg')} className={input} />
            <span className="text-xs font-normal text-muted">{tm('divisionHint')}</span></label>
        </>
      ) : null}
    </>
  );
}
