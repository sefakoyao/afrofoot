import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { DEFAULT_LOCALE, LOCALES, isLocale, type Locale } from '@afrofoot/i18n';

/** Public address of the website, used for canonical links, the sitemap and link previews. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.afrofoot.club').replace(/\/$/, '');
export const SITE_NAME = 'Afro Foot Club';
export const OG_IMAGE = { url: '/og-image.jpg', width: 1200, height: 630, alt: 'Afro Foot Club' };

const OG_LOCALE: Record<Locale, string> = { en: 'en_GB', fi: 'fi_FI', fr: 'fr_FR', ar: 'ar_AR' };

/** Address of a page in one language: English has no prefix (localePrefix "as-needed"), the others start with /fi, /fr, /ar. */
export function localePath(locale: Locale, path: string): string {
  const p = path === '/' ? '' : path;
  return locale === DEFAULT_LOCALE ? p || '/' : `/${locale}${p}`;
}

/** hreflang links: the same page in every language, plus x-default (English). */
export function languageAlternates(path: string): Record<string, string> {
  const out: Record<string, string> = Object.fromEntries(LOCALES.map((l) => [l, localePath(l, path)]));
  out['x-default'] = localePath(DEFAULT_LOCALE, path);
  return out;
}

type PageMetaInput = {
  locale: string;
  path: string;
  title?: string;
  description: string;
  image?: { url: string; width?: number; height?: number; alt?: string };
  article?: { publishedTime: string };
};

/** Title, description, canonical and language links, and the Facebook / WhatsApp / LinkedIn / X preview of a page. */
export function pageMeta({ locale, path, title, description, image, article }: PageMetaInput): Metadata {
  const l: Locale = isLocale(locale) ? locale : DEFAULT_LOCALE;
  const url = localePath(l, path);
  const desc = description.length > 200 ? `${description.slice(0, 197).trimEnd()}…` : description;
  const img = image ?? OG_IMAGE;
  return {
    ...(title ? { title } : {}),
    description: desc,
    alternates: { canonical: url, languages: languageAlternates(path) },
    openGraph: {
      type: article ? 'article' : 'website',
      siteName: SITE_NAME,
      url,
      title: title ?? SITE_NAME,
      description: desc,
      locale: OG_LOCALE[l],
      alternateLocale: LOCALES.filter((x) => x !== l).map((x) => OG_LOCALE[x]),
      images: [img],
      ...(article ? { publishedTime: article.publishedTime } : {}),
    },
    twitter: { card: 'summary_large_image', title: title ?? SITE_NAME, description: desc, images: [img.url] },
  };
}

/** Metadata of a fixed page from two message keys (title and description) in the "site" namespace. */
export async function staticPageMeta(locale: string, path: string, titleKey: string | null, descKey: string): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'site' });
  return pageMeta({ locale, path, title: titleKey ? t(titleKey as 'seo_home') : undefined, description: t(descKey as 'seo_home') });
}

/** Plain text of a Markdown article, for a description when the post has no excerpt. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+|^>\s?/gm, '')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Serialise structured data for a <script type="application/ld+json">, escaping "<" so text cannot close the tag. */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
