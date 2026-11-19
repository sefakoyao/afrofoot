'use client';

import { useTranslations } from 'next-intl';
import { FootballIcon, type RobotItem as Item } from '@afrofoot/ui/football-icons';

export { FootballIcon }; // the icons live in @afrofoot/ui (also used by the website's robot check)
export type ChallengeView = { token: string; target: Item; options: Item[] };

/**
 * Robot check on the sign-up forms: "Robot check: tap the whistle". Six football things in a random order, one of them
 * asked for. Real radio buttons, so it works with a keyboard and a screen reader. The server checks the answer against
 * the signed challenge (lib/robot-check.ts). Includes the honeypot field robots fill in and people never see.
 */
export function FootballCheck({ challenge, error }: { challenge: ChallengeView; error?: boolean }) {
  const t = useTranslations('auth');
  const target = t(`item_${challenge.target}`);
  return (
    <fieldset className={`grid gap-3 rounded-card border-2 p-4 ${error ? 'border-danger' : 'border-accent/50'}`} data-robot-check aria-describedby="robot-hint">
      <legend className="px-1 font-display font-extrabold">{t('robotTitle')}</legend>
      <p id="robot-hint" className="text-sm"><span className="text-muted">{t('robotAsk')}</span> <b data-robot-target={challenge.target}>{target}</b></p>
      <input type="hidden" name="robot_token" value={challenge.token} />
      <div className="grid grid-cols-3 gap-2 rounded-card p-2" style={{ background: 'repeating-linear-gradient(90deg, #2f8f22 0 16.66%, #349a26 16.66% 33.33%)' }}>
        {challenge.options.map((item) => (
          <label key={item} className="relative">
            <input type="radio" name="robot_answer" value={item} required className="peer sr-only" data-robot-option={item} />
            <span className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-control bg-white/90 text-ink-950 shadow-sm transition active:scale-95 peer-checked:bg-ink-950 peer-checked:text-white peer-checked:ring-4 peer-checked:ring-accent peer-focus-visible:ring-4 peer-focus-visible:ring-white">
              <FootballIcon item={item} className="size-10 sm:size-12" />
              <span className="sr-only">{t(`item_${item}`)}</span>
            </span>
          </label>
        ))}
      </div>
      {/* Honeypot: hidden from people (and screen readers); form-filling robots fill it in. */}
      <div aria-hidden className="absolute -start-[9999px] h-px w-px overflow-hidden">
        <label>Website<input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" /></label>
      </div>
    </fieldset>
  );
}
