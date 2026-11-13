import { setRequestLocale } from 'next-intl/server';
import { TeamInfo } from '@/components/TeamInfo';

export default async function WomenPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <TeamInfo variant="w" />;
}
