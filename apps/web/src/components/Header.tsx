import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { LanguageSwitcher } from './LanguageSwitcher';

const NAV = [
  ['/', 'n_home'],
  ['/news', 'n_news'],
  ['/team', 'n_team'],
  ['/membership', 'n_mem'],
  ['/join', 'n_join'],
  ['/sponsors', 'n_sp'],
  ['/contact', 'n_contact'],
] as const;

// The member app is not live yet. Set NEXT_PUBLIC_APP_URL (for example https://app.afrofoot.club) to show the Sign in button.
const APP_URL = process.env.NEXT_PUBLIC_APP_URL;

export async function Header() {
  const t = await getTranslations('site');
  return (
    <header className="sticky top-0 z-40">
      {/* Utility bar: audiences, join call to action, language */}
      <div className="bg-black text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-2 text-sm">
          <nav aria-label="Teams" className="flex gap-4 font-semibold">
            <Link href="/team" className="hover:text-accent">{t('au_m')}</Link>
            <Link href="/women" className="hover:text-accent">{t('au_w')}</Link>
            <Link href="/juniors" className="hover:text-accent">{t('au_j')}</Link>
          </nav>
          <div className="flex items-center gap-4">
            <Link href="/join" className="font-bold text-accent hover:underline">{t('au_join')} →</Link>
            <LanguageSwitcher />
          </div>
        </div>
      </div>
      {/* Main bar */}
      <div className="border-b border-line bg-raised">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-2">
          <Link href="/" className="flex items-center gap-3" aria-label="Afro Foot Club">
            <Image src="/afc-logo.png" alt="" width={34} height={48} priority />
            <span className="font-display text-lg font-extrabold leading-tight">Afro Foot<br />Club</span>
          </Link>
          <nav aria-label="Main" className="flex flex-wrap items-center gap-x-5 gap-y-1 font-display font-bold">
            {NAV.map(([href, key]) => (
              <Link key={href} href={href} className="hover:text-pitch">{t(key)}</Link>
            ))}
            {APP_URL ? <a href={APP_URL} className="rounded-full border-2 border-fg px-4 py-1.5 hover:bg-fg hover:text-raised">{t('signin')}</a> : null}
          </nav>
        </div>
      </div>
    </header>
  );
}
