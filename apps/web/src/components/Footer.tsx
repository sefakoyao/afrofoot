import { getTranslations } from 'next-intl/server';

export async function Footer() {
  const t = await getTranslations('site');
  return (
    <footer className="mt-16 border-t-4 border-accent bg-black text-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8">
        <p className="flex flex-wrap gap-x-5 font-display text-lg font-extrabold text-accent">
          <span>{t('val1')}</span>
          <span>{t('val2')}</span>
          <span>{t('val3')}</span>
        </p>
        <p className="text-sm text-white/70">{t('ft_rights')}</p>
      </div>
    </footer>
  );
}
