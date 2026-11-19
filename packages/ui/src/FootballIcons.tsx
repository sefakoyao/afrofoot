import type { ReactNode } from 'react';

/** The football things of the robot check (robot-check.ts), drawn as line icons. Purely visual (aria-hidden). */
export type RobotItem = 'ball' | 'boot' | 'whistle' | 'goal' | 'cone' | 'shirt' | 'trophy' | 'flag' | 'gloves';

const ICONS: Record<RobotItem, ReactNode> = {
  ball: <><circle cx="24" cy="24" r="17" /><path d="M24 15l7 5-2.7 8h-8.6L17 20z" fill="currentColor" stroke="none" /><path d="M24 15V7M31 20l7-3M28.3 28l5 6.5M19.7 28l-5 6.5M17 20l-7-3" /></>,
  boot: <><path d="M8 14h13c1 5 4 8 10 10l8 2.5c2 .6 3 2 3 3.5v3H8z" /><path d="M8 33h34" /><path d="M12 33v4M20 33v4M30 33v4M38 33v4" strokeLinecap="round" /><path d="M17 18l4 1M18 22l5 1" /></>,
  whistle: <><circle cx="29" cy="28" r="11" /><path d="M20 19.5H6.5a1.5 1.5 0 0 0-1.5 1.5v4a1.5 1.5 0 0 0 1.5 1.5H18" /><path d="M24 17.5h-4v6" /><circle cx="29" cy="28" r="3.5" fill="currentColor" stroke="none" /><circle cx="38" cy="14" r="3.5" /><path d="M35.5 16.5l-2.5 2.5" /></>,
  goal: <><path d="M6 36V12h36v24" strokeWidth="3" /><path d="M6 12l5 5h26l5-5M11 17v19M37 17v19M17 17v19M24 17v19M31 17v19M11 24h26M11 30h26" strokeWidth="1.3" /></>,
  cone: <><path d="M24 7l11 30H13z" /><path d="M8 37h32v4H8z" fill="currentColor" stroke="none" /><path d="M17.5 25h13M20 18h8" strokeWidth="3" /></>,
  shirt: <><path d="M17 8l-9 6 4 7 4-2v21h16V19l4 2 4-7-9-6c-1 3-3.5 5-7 5s-6-2-7-5z" /><text x="24" y="32" textAnchor="middle" fontSize="10" fontWeight="900" fill="currentColor" stroke="none">10</text></>,
  trophy: <><path d="M15 8h18v8a9 9 0 0 1-18 0z" /><path d="M15 11H9c0 6 3 9 7 9M33 11h6c0 6-3 9-7 9" /><path d="M24 25v6M17 40h14M19 31h10l1 9H18z" /></>,
  flag: <><path d="M14 42V6" strokeWidth="3" strokeLinecap="round" /><path d="M14 7l20 6-20 7z" fill="currentColor" /><path d="M8 42h16" /><path d="M28 42a10 10 0 0 1 12-10" strokeDasharray="2 2" /></>,
  gloves: <><path d="M14 40V24l-4-6a2.5 2.5 0 0 1 4-3l3 4V9a2.5 2.5 0 0 1 5 0v9-11a2.5 2.5 0 0 1 5 0v11-9a2.5 2.5 0 0 1 5 0v10-6a2.5 2.5 0 0 1 5 0v14c0 7-4 11-9 11v3z" /><path d="M14 34h20" /></>,
};

export function FootballIcon({ item, className = 'size-10' }: { item: RobotItem; className?: string }) {
  return <svg viewBox="0 0 48 48" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">{ICONS[item]}</svg>;
}

