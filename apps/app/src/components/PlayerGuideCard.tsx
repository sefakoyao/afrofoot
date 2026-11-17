import { getLocale, getTranslations } from 'next-intl/server';
import { LOCALES, LOCALE_LABELS, isLocale } from '@afrofoot/i18n';
import { CopyLinkButton } from './CopyLinkButton';

/** The one-page player guide (account, sign-in, Code of Conduct, contract, fees) as a PDF per language, in public/guides. */
export const guidePath = (lang: string) => `/guides/player-guide-${lang}.pdf`;

/**
 * Card on the admin and coach home pages: download the player guide in any of the four languages, or copy the link to
 * the guide in the viewer's language to share with the team. The PDFs hold no personal data.
 */
export async function PlayerGuideCard() {
  const [t, raw] = await Promise.all([getTranslations('app'), getLocale()]);
  const locale = isLocale(raw) ? raw : 'en';
  return (
    <section aria-labelledby="guide-h" className="rounded-card border border-line bg-raised p-6" data-player-guide>
      <h2 id="guide-h" className="font-display text-lg font-extrabold">{t('guideTitle')}</h2>
      <p className="mt-1 text-sm text-muted">{t('guideLead')}</p>
      <ul className="mt-4 flex flex-wrap gap-2">
        {LOCALES.map((l) => (
          <li key={l}>
            <a href={guidePath(l)} target="_blank" rel="noopener" lang={l} hrefLang={l} type="application/pdf" data-guide={l}
              aria-label={t('guideDownload', { language: LOCALE_LABELS[l].native })}
              className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 font-display font-bold ${l === locale ? 'bg-accent text-on-accent hover:brightness-110' : 'border border-line bg-surface hover:border-accent'}`}>
              <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
              {LOCALE_LABELS[l].native}
            </a>
          </li>
        ))}
        <li><CopyLinkButton path={guidePath(locale)} label={t('guideCopy')} done={t('guideCopied')} hint={t('guideCopyHint')} /></li>
      </ul>
    </section>
  );
}
