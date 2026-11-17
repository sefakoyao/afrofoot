import type { Metadata } from 'next';
import { staticPageMeta } from '@/lib/seo';
import { setRequestLocale } from 'next-intl/server';
import { TeamInfo } from '@/components/TeamInfo';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return staticPageMeta((await params).locale, '/women', 'au_w', 'seo_women');
}

export default async function WomenPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <TeamInfo variant="w" />;
}
