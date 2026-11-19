'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

const NEW = '__new_opponent__'; // the "+ Add a new opponent" choice
const input = 'min-h-11 w-full rounded-control border border-line bg-raised px-3';

/**
 * The opponent of a game or friendly (migration 0061): one of the club's saved opponents, or "+ Add a new opponent",
 * which opens a name field right here. A new name is remembered by the database when the game is saved.
 * The chosen or typed name is sent as `name` (the forms expect plain text, as before).
 */
export function OpponentPicker({ opponents, name, className = '' }: { opponents: string[]; name: string; className?: string }) {
  const t = useTranslations('events');
  const tm = useTranslations('match');
  const [choice, setChoice] = useState('');
  const isNew = choice === NEW || opponents.length === 0;
  return (
    <div className={`grid gap-3 ${className}`} data-opponent-picker>
      {opponents.length ? (
        <label className="grid gap-1 text-sm font-semibold">{tm('opponent')}
          <select name={isNew ? undefined : name} required value={choice} onChange={(e) => setChoice(e.target.value)} className={input} data-opponent-select>
            <option value="" disabled>{t('opponentChoose')}</option>
            {opponents.map((o) => <option key={o} value={o}>{o}</option>)}
            <option value={NEW}>{t('opponentNew')}</option>
          </select>
        </label>
      ) : null}
      {isNew ? (
        <label className="grid gap-1 text-sm font-semibold" data-opponent-new>{opponents.length ? t('opponentNewName') : tm('opponent')}
          <input name={name} required maxLength={120} dir="auto" autoFocus={opponents.length > 0} placeholder={t('opponentEg')} className={input} />
          {opponents.length ? <span className="text-xs font-normal text-muted">{t('opponentNewHint')}</span> : null}</label>
      ) : null}
    </div>
  );
}
