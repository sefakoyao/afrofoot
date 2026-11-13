import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('site');

  return (
    <>
      <section className="bg-ink-950 text-white">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-20 md:py-28">
          <h1 className="font-display text-5xl font-black leading-[1.02] md:text-7xl">
            {t('h1a')} <span className="text-accent">{t('h1b')}</span> {t('h1c')}
          </h1>
          <p className="max-w-xl text-lg text-white/80">{t('promo_p')}</p>
          <div>
            <Link href="/join" className="inline-block rounded-full bg-accent px-7 py-3 font-display text-base font-bold text-on-accent hover:brightness-110">
              {t('au_join')} →
            </Link>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="font-display text-4xl font-extrabold text-pitch">{t('promo_h')}</h2>
        <p className="mt-3 max-w-2xl text-muted">{t('promo_p')}</p>
      </section>
    </>
  );
}
