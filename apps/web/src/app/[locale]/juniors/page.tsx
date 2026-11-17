import type { Metadata } from 'next';
import { staticPageMeta } from '@/lib/seo';
import { setRequestLocale } from 'next-intl/server';
import { TeamInfo } from '@/components/TeamInfo';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return staticPageMeta((await params).locale, '/juniors', 'au_j', 'seo_juniors');
}

export default async function JuniorsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <TeamInfo variant="j" />;
}
