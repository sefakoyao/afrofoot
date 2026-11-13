import type { ReactNode } from 'react';
import { Link } from '@/i18n/routing';

export function Hero({ title, lead, upcoming }: { title: string; lead?: string; upcoming?: string }) {
  return (
    <section className="bg-ink-950 text-white">
      <div className="mx-auto max-w-6xl px-4 py-14 md:py-20">
        <span className="rounded-full bg-accent px-3 py-1 text-xs font-bold text-on-accent">Afro Foot Club</span>
        <h1 className="mt-4 font-display text-4xl font-black md:text-6xl">{title}</h1>
        {upcoming ? <p className="mt-3 inline-block rounded-full border border-accent px-3 py-1 text-sm font-bold text-accent">{upcoming}</p> : null}
        {lead ? <p className="mt-4 max-w-2xl text-lg text-white/80">{lead}</p> : null}
      </div>
    </section>
  );
}

export const Section = ({ id, children }: { id?: string; children: ReactNode }) => (
  <section id={id} className="mx-auto max-w-6xl scroll-mt-28 px-4 py-8">{children}</section>
);

export const H2 = ({ children }: { children: ReactNode }) => <h2 className="font-display text-3xl font-extrabold text-pitch">{children}</h2>;
export const Card = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <div className={`rounded-card border border-line bg-raised p-5 shadow-sm ${className}`}>{children}</div>
);
export const Tag = ({ children, solid }: { children: ReactNode; solid?: boolean }) => (
  <span className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${solid ? 'bg-accent/20 text-pitch' : 'bg-line text-muted'}`}>{children}</span>
);
export const Check = ({ items, no }: { items: string[]; no?: boolean }) => (
  <ul className="mt-3 grid gap-2">
    {items.map((i) => <li key={i} className="flex gap-2"><span aria-hidden className={no ? 'text-danger' : 'text-pitch'}>{no ? '✕' : '✓'}</span><span>{i}</span></li>)}
  </ul>
);

const btn = 'inline-block rounded-full px-6 py-2.5 font-display font-bold';
export const ButtonLink = ({ href, children, ghost }: { href: string; children: ReactNode; ghost?: boolean }) => (
  <Link href={href} className={`${btn} ${ghost ? 'border-2 border-fg hover:bg-fg hover:text-raised' : 'bg-accent text-on-accent hover:brightness-110'}`}>{children}</Link>
);
