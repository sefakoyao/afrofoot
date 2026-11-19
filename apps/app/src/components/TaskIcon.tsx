/**
 * The icons of game-day and training tasks (migration 0062: task_types.icon, checked by app.task_icon_ok()).
 * Line drawings on a 24 × 24 grid in the current colour, so they suit the green chips and dark mode alike.
 */
export const TASK_ICONS = ['ball', 'water', 'first_aid', 'shirt', 'bib', 'cone', 'car', 'whistle', 'camera', 'snack', 'flag', 'bag', 'key', 'clipboard', 'star', 'music'] as const;
export type TaskIconName = (typeof TASK_ICONS)[number];

const PATHS: Record<TaskIconName, React.ReactNode> = {
  ball: <><circle cx="12" cy="12" r="9" /><path d="m12 7.5 3.6 2.6-1.4 4.2H9.8l-1.4-4.2z" /><path d="M12 3v4.5M20.6 9.4l-5 .7M17.3 19.2l-3.1-4.9M6.7 19.2l3.1-4.9M3.4 9.4l5 .7" /></>,
  water: <><path d="M10 2h4v3h-4z" /><path d="M9 5h6l1 3v12a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V8z" /><path d="M8 12h8M8 16h8" /></>,
  first_aid: <><rect x="3" y="6" width="18" height="14" rx="2" /><path d="M9 6V4h6v2M12 10v6M9 13h6" /></>,
  shirt: <><path d="M8 3 3 6l2 4 2-1v12h10V9l2 1 2-4-5-3a4 4 0 0 1-8 0z" /></>,
  bib: <><path d="M8 3v3a4 4 0 0 0 8 0V3" /><path d="M8 3 5 5v16h14V5l-3-2" /><path d="M9 14h6" /></>,
  cone: <><path d="M10 3h4l5 16H5z" /><path d="M8 11h8M7 15h10M3 21h18" /></>,
  car: <><path d="M5 16 6.5 9.5A2 2 0 0 1 8.4 8h7.2a2 2 0 0 1 1.9 1.5L19 16" /><rect x="3" y="13" width="18" height="5" rx="1.5" /><circle cx="7" cy="18.5" r="1.5" /><circle cx="17" cy="18.5" r="1.5" /></>,
  whistle: <><circle cx="9" cy="14" r="5" /><path d="M12.5 10.5 21 7v4l-6.3 2.2" /><path d="M9 14h.01" strokeWidth="3" /></>,
  camera: <><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13.5" r="3.5" /></>,
  snack: <><path d="M12 8c-3-2-8-1-8 5 0 5 3 8 5 8 1 0 2-.5 3-.5s2 .5 3 .5c2 0 5-3 5-8 0-6-5-7-8-5z" /><path d="M12 8c0-3 1-5 3-6" /></>,
  flag: <><path d="M5 21V4" /><path d="M5 4h12l-2 4 2 4H5" /></>,
  bag: <><rect x="3" y="8" width="18" height="12" rx="2" /><path d="M9 8V6a3 3 0 0 1 6 0v2M3 13h18" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="m11 12 9-9M17 6l2 2M15 8l2 2" /></>,
  clipboard: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3" /></>,
  star: <><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" /></>,
  music: <><path d="M9 18V5l11-2v13" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="17.5" cy="16" r="2.5" /></>,
};

export function TaskIcon({ name, className = 'size-5' }: { name: string; className?: string }) {
  const p = PATHS[name as TaskIconName] ?? PATHS.star;
  return (
    <svg viewBox="0 0 24 24" className={`shrink-0 ${className}`} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{p}</svg>
  );
}
