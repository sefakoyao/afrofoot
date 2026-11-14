import type { ReactNode } from 'react';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Logo } from '@/components/Logo';

/** Signed-out screens: black top bar with logo and languages, one centred card. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div data-surface="player" className="flex min-h-screen flex-col">
      <header className="bg-ink-950 text-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <span className="flex items-center gap-2 font-display font-extrabold"><Logo size={36} /> Afro Foot Club</span>
          <LanguageSwitcher />
        </div>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 py-10 sm:items-center">
        <div className="w-full max-w-md rounded-card border border-line bg-raised p-6 shadow-[0_20px_60px_-30px_rgb(0_0_0/0.35)] sm:p-8">{children}</div>
      </main>
    </div>
  );
}
