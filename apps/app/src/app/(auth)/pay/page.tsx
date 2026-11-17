import { encodeEmail } from '@afrofoot/ui/email';
import { ProtectedEmail } from '@afrofoot/ui/protected-email';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { PayDetails } from '@/components/PayDetails';
import { loadBilling } from '@/lib/invoice/data';
import { getSupabase } from '@/lib/supabase/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('me'))('howToPay') };
}

/**
 * Public payment page (no sign-in): players whose sign-in is blocked for overdue fees (migration 0022) can still pay.
 * Shows only the club's public account details (site_settings 'billing', is_public); a player's own invoices stay behind sign-in.
 */
export default async function PayPage() {
  const [t, supabase] = await Promise.all([getTranslations('me'), getSupabase()]);
  const billing = supabase ? await loadBilling(supabase) : null;
  return (
    <div className="grid gap-4">
      <h1 className="font-display text-2xl font-extrabold">{t('howToPay')}</h1>
      <p className="text-muted">{t('payPublicLead')}</p>
      {billing ? <PayDetails billing={billing} /> : <p className="rounded-card bg-surface p-4">{t('payNotReady')}</p>}
      <p className="text-sm text-muted">{t('payPublicRef')}</p>
      {billing?.email ? <p className="text-sm">{t('payContact')} <ProtectedEmail code={encodeEmail(billing.email)} fallback={t('mailJs')} className="font-semibold text-pitch underline" />{billing.phone ? <> · <a href={`tel:${billing.phone.replace(/\s+/g, '')}`} dir="ltr" className="font-semibold text-pitch underline">{billing.phone}</a></> : null}</p> : null}
      <Link href="/login" className="text-center text-sm font-semibold text-pitch underline underline-offset-2">{t('payBackToLogin')}</Link>
    </div>
  );
}
