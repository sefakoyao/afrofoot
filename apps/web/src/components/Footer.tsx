import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';

const LINKS = [['/news', 'n_news'], ['/team', 'n_team'], ['/membership', 'n_mem'], ['/join', 'n_join'], ['/sponsors', 'n_sp'], ['/contact', 'n_contact']] as const;

export async function Footer() {
  const t = await getTranslations('site');
  return (
    <footer className="mt-16 border-t-4 border-accent bg-black text-white">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <p className="flex flex-wrap gap-x-6 gap-y-1 font-display text-xl font-extrabold text-accent">
          <span>{t('val1')}</span><span>{t('val2')}</span><span>{t('val3')}</span>
        </p>
        <div className="mt-8 grid gap-8 md:grid-cols-3">
          <div className="flex items-center gap-3">
            <Image src="/afc-logo.png" alt="" width={34} height={48} />
            <p className="font-display text-lg font-extrabold">Afro Foot Club ry</p>
          </div>
          <div>
            <h4 className="font-display font-bold text-accent">{t('ft_c')}</h4>
            <p className="mt-2 text-white/80">info@afrofoot.club<br />+358 50 477 3030</p>
          </div>
          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-4 gap-y-1">
            {LINKS.map(([href, k]) => <Link key={href} href={href} className="text-white/80 hover:text-accent">{t(k)}</Link>)}
          </nav>
        </div>
        <p className="mt-8 border-t border-white/15 pt-4 text-sm text-white/60">{t('ft_rights')}</p>
      </div>
    </footer>
  );
}
