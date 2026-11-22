/**
 * Menu icons for the Admin, Coach and Player areas (AreaNav, PlayerTabs). Line drawings on a 24 × 24 grid in the
 * current colour; decorative (the text label beside each one is what screen readers read).
 */
export type NavIconName =
  | 'home' | 'inbox' | 'users' | 'key' | 'contract' | 'team' | 'calendar' | 'link' | 'shirt' | 'versus' | 'chart' | 'scale'
  | 'receipt' | 'coins' | 'quiz' | 'list' | 'card' | 'trophy' | 'user' | 'ball' | 'handshake' | 'euro' | 'star' | 'tasks' | 'history' | 'lineup' | 'image' | 'merge' | 'more' | 'whistle' | 'share' | 'pin';

const PATHS: Record<NavIconName, React.ReactNode> = {
  share: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4" /></>,
  home: <><path d="M3 11 12 4l9 7" /><path d="M5 10v10h5v-6h4v6h5V10" /></>,
  inbox: <><path d="M3 13h5l1.5 3h5L16 13h5" /><path d="M5 5h14l2 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="m11 12 9-9M17 6l2 2M15 8l2 2" /></>,
  contract: <><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 13h7M9 17l2-1 1.5 1.5L15 16" /></>,
  team: <><path d="M12 3 4 6v5c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6z" /><path d="m9 12 2 2 4-4" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  shirt: <><path d="M8 3 3 6l2 4 2-1v12h10V9l2 1 2-4-5-3a4 4 0 0 1-8 0z" /></>,
  versus: <><path d="m4 4 7 7M20 4l-7 7" /><path d="m3 21 5-5M21 21l-5-5M5 14l5 5M19 14l-5 5" /></>,
  chart: <><path d="M3 21h18" /><path d="M6 17v-5M11 17V8M16 17v-7M21 5l-5 3-5-4-5 4" /></>,
  scale: <><path d="M12 3v18M7 21h10M4 7h16" /><path d="m4 7-2.5 6a2.5 2.5 0 0 0 5 0zM20 7l-2.5 6a2.5 2.5 0 0 0 5 0z" /></>,
  receipt: <><path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
  coins: <><ellipse cx="9" cy="7" rx="6" ry="3" /><path d="M3 7v5c0 1.7 2.7 3 6 3s6-1.3 6-3V7" /><path d="M9 15v2c0 1.7 2.7 3 6 3s6-1.3 6-3v-5c0-1.7-2.7-3-6-3" /></>,
  quiz: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01" /></>,
  list: <><path d="M9 6h12M9 12h12M9 18h12" /><path d="M4 6h.01M4 12h.01M4 18h.01" strokeWidth="3" /></>,
  card: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h4" /></>,
  trophy: <><path d="M8 4h8v5a4 4 0 0 1-8 0z" /><path d="M8 6H4v1a4 4 0 0 0 4 4M16 6h4v1a4 4 0 0 1-4 4M12 13v4M8 21h8l-1-4H9z" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  ball: <><circle cx="12" cy="12" r="9" /><path d="m12 7.5 3.6 2.6-1.4 4.2H9.8l-1.4-4.2z" /><path d="M12 3v4.5M20.6 9.4l-5 .7M17.3 19.2l-3.1-4.9M6.7 19.2l3.1-4.9M3.4 9.4l5 .7" /></>,
  handshake: <><path d="m11 17 2 2a1.4 1.4 0 0 0 2-2" /><path d="m14 14 2.5 2.5a1.4 1.4 0 0 0 2-2L15 11l-1.5 1a2 2 0 0 1-2.5-3l3-2.5a3 3 0 0 1 3 0L21 9" /><path d="m3 9 4-3 4 1M3 9l-1 6 4 4a1.4 1.4 0 0 0 2-2" /></>,
  euro: <><path d="M17 6.5A7 7 0 1 0 17 17.5" /><path d="M4 10h9M4 14h9" /></>,
  star: <><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" /></>,
  history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></>,
  lineup: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M4 12h16M9.5 3v3h5V3M9.5 21v-3h5v3" /><circle cx="12" cy="12" r="2" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="9.5" r="1.8" /><path d="m3 17 5-5 4 4 3-3 6 6" /></>,
  merge: <><circle cx="6" cy="6" r="2.5" /><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="12" r="2.5" /><path d="M8.5 6h2a4 4 0 0 1 4 4v0M8.5 18h2a4 4 0 0 0 4-4v0M14.5 12h1" /></>,
  more: <><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></>,
  whistle: <><circle cx="9" cy="14" r="5" /><path d="M13 11h8v3h-5M9 14h.01" /></>,
  pin: <><path d="M12 21s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z" /><circle cx="12" cy="9" r="2.5" /></>,
  tasks: <><rect x="4" y="4" width="16" height="17" rx="2" /><path d="m8 10 1.5 1.5L12 9M8 16l1.5 1.5L12 15M14 10h3M14 16h3" /></>,
};

export function NavIcon({ name, className = 'size-[18px]' }: { name: NavIconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`shrink-0 ${className}`} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{PATHS[name]}</svg>
  );
}
