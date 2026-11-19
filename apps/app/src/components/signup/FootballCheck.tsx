'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { FootballIcon, type RobotItem as Item } from '@afrofoot/ui/football-icons';
import { RobotCheckCard } from '@afrofoot/ui/robot-check-card';
import { freshRobotChallenge } from '@/app/actions/signup';

export { FootballIcon }; // the icons live in @afrofoot/ui (also used by the website's robot check)
export type ChallengeView = { token: string; target: Item; options: Item[] };

/**
 * Robot check on the sign-up forms, in the card design shared with the website (@afrofoot/ui/robot-check-card).
 * "New pictures" asks the server for a fresh signed challenge (lib/robot-check.ts checks the answer). Includes the
 * honeypot field robots fill in and people never see.
 */
export function FootballCheck({ challenge, error }: { challenge: ChallengeView; error?: boolean }) {
  const t = useTranslations('auth');
  const [c, setC] = useState(challenge);
  const [busy, start] = useTransition();
  const renew = () => start(async () => { const next = await freshRobotChallenge(); if (next) setC(next as ChallengeView); });
  return (
    <div className="relative">
      <RobotCheckCard challenge={c} error={error} busy={busy} onNewPictures={renew}
        labels={{ title: t('robotTitle'), ask: t('robotAsk'), newPictures: t('robotNew'), lead: t('robotLead'), item: (i) => t(`item_${i}`) }} />
      {/* Honeypot: hidden from people (and screen readers); form-filling robots fill it in. */}
      <div aria-hidden className="absolute -start-[9999px] h-px w-px overflow-hidden">
        <label>Website<input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" /></label>
      </div>
    </div>
  );
}
