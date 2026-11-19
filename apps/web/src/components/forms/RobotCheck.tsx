'use client';

import { useEffect, useState } from 'react';
import { RobotCheckCard, type RobotCheckChallenge } from '@afrofoot/ui/robot-check-card';
import type { Labels } from './fields';

/**
 * The robot check on the website's contact and sponsor forms (card design shared with the app's sign-up:
 * @afrofoot/ui/robot-check-card). Asks the server for a fresh challenge when it appears, after every failed send
 * (`round` changes) and on "New pictures", since a challenge counts once.
 */
export function RobotCheck({ labels, round, error }: { labels: Labels; round: unknown; error?: boolean }) {
  const [c, setC] = useState<RobotCheckChallenge | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [again, setAgain] = useState(0);
  useEffect(() => {
    let live = true;
    setState('loading');
    fetch('/api/robot-check', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: RobotCheckChallenge) => { if (live) { setC(j); setState('ready'); } })
      .catch(() => { if (live) setState('unavailable'); });
    return () => { live = false; };
  }, [round, again]);

  if (state === 'unavailable') return <p role="alert" className="mt-4 rounded-card bg-danger/10 p-3 text-sm font-semibold text-danger" data-robot-unavailable>{labels.rc_unavailable}</p>;
  return (
    <div className="mt-5">
      <RobotCheckCard challenge={state === 'ready' ? c : null} error={error} onNewPictures={() => setAgain((n) => n + 1)}
        labels={{ title: labels.rc_title ?? '', ask: labels.rc_ask ?? '', newPictures: labels.rc_new ?? '', lead: labels.rc_lead ?? '', item: (i) => labels[`rc_item_${i}`] ?? i }} />
    </div>
  );
}
