import type { ReactNode } from 'react';
import { BallArcs } from '@afrofoot/ui/ball-arcs';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Logo } from '@/components/Logo';

/** Signed-out screens: black top bar with logo and languages, one centred card over the animated "ball arcs" background. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div data-surface="player" className="flex min-h-screen flex-col">
      <header className="bg-ink-950 text-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <span className="flex items-center gap-2 font-display font-extrabold"><Logo size={36} /> Afro Foot Club</span>
          <LanguageSwitcher />
        </div>
      </header>
      <main className="relative isolate flex flex-1 items-start justify-center overflow-hidden bg-[radial-gradient(110%_70%_at_75%_100%,#123b0e_0%,#0b0f0a_70%)] px-4 py-10 sm:items-center">
        <div className="absolute inset-0 -z-10" aria-hidden data-auth-bg><BallArcs shape="tall" className="sm:!hidden" /><BallArcs shape="wide" className="!hidden sm:!block" /></div>
        <div className="w-full max-w-md rounded-card border border-line bg-raised p-6 shadow-[0_20px_60px_-30px_rgb(0_0_0/0.35)] sm:p-8">{children}</div>
      </main>
    </div>
  );
}
