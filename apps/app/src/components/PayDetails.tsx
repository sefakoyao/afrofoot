import { encodeEmail } from '@afrofoot/ui/email';
import { ProtectedEmail } from '@afrofoot/ui/protected-email';
import { getLocale, getTranslations } from 'next-intl/server';
import { CURRENCY, LOCALE_LABELS, isLocale } from '@afrofoot/i18n';
import { CopyButton } from '@/components/CopyButton';
import { finnishBarcode, formatIban, formatReference } from '@/lib/invoice/barcode';

export interface PayBilling { legal_name: string; iban: string; bic: string; email: string; phone: string }
export interface PayItem { id: string; invoiceNumber: string | null; reference: string; amountCents: number; dueOn: string | null; overdue: boolean }

const day = (iso: string) => new Date(`${iso}T12:00:00Z`);

/**
 * How to pay by bank transfer: the club's account (public billing setting, migration 0027) and, for a signed-in player,
 * one card per open invoice with reference number, amount, due date and the bank barcode, each with a copy button.
 */
export async function PayDetails({ billing, items }: { billing: PayBilling; items?: PayItem[] }) {
  const [t, rawLocale] = await Promise.all([getTranslations('me'), getLocale()]);
  const tag = LOCALE_LABELS[isLocale(rawLocale) ? rawLocale : 'en'].intl;
  const money = new Intl.NumberFormat(tag, { style: 'currency', currency: CURRENCY });
  const date = new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  if (!billing.iban) {
    return <p className="rounded-card bg-surface p-4" data-pay-missing>{t('payNotReady')}{billing.email ? <> <ProtectedEmail code={encodeEmail(billing.email)} fallback={t('mailJs')} className="font-semibold text-pitch underline" /></> : null}</p>;
  }
  const Row = ({ k, v, copy, mono }: { k: string; v: string; copy?: string; mono?: boolean }) => (
    <div className="flex flex-wrap items-center justify-between gap-2 py-2">
      <dt className="text-sm text-muted">{k}</dt>
      <dd className="flex min-w-0 flex-wrap items-center gap-2">
        <span dir="ltr" className={`select-all font-semibold ${mono ? 'break-all font-mono text-sm' : ''}`}>{v}</span>
        {copy ? <CopyButton value={copy} label={k} /> : null}
      </dd>
    </div>
  );
  return (
    <div className="grid gap-4">
      <dl className="divide-y divide-line rounded-card bg-surface px-4" data-pay-account>
        {billing.legal_name ? <Row k={t('payRecipient')} v={billing.legal_name} /> : null}
        <Row k="IBAN" v={formatIban(billing.iban)} copy={billing.iban.replace(/\s+/g, '')} />
        {billing.bic ? <Row k="BIC" v={billing.bic} /> : null}
      </dl>
      {items?.length ? (
        <ul className="grid gap-3">
          {items.map((i) => {
            const code = finnishBarcode(billing.iban, i.amountCents, i.reference, i.dueOn);
            return (
              <li key={i.id} data-pay-item={i.invoiceNumber ?? i.reference} className={`rounded-card border-2 p-4 ${i.overdue ? 'border-danger/40 bg-danger/5' : 'border-accent/50'}`}>
                <p className="font-display text-lg font-extrabold">{i.invoiceNumber ? `${t('invoiceNo')} ${i.invoiceNumber}` : t('payment')}</p>
                <dl className="divide-y divide-line">
                  <Row k={t('payReference')} v={formatReference(i.reference)} copy={i.reference.replace(/\s+/g, '')} />
                  <Row k={t('colAmount')} v={money.format(i.amountCents / 100)} copy={(i.amountCents / 100).toFixed(2).replace('.', ',')} />
                  {i.dueOn ? <Row k={t('payDue')} v={date.format(day(i.dueOn))} /> : null}
                  {code ? <Row k={t('payBarcode')} v={code} copy={code} mono /> : null}
                </dl>
              </li>
            );
          })}
        </ul>
      ) : null}
      <ul className="grid list-disc gap-1 ps-5 text-sm text-muted">
        <li>{t('payStep1')}</li>
        <li>{t('payStep2')}</li>
        <li>{t('payStep3')}</li>
      </ul>
    </div>
  );
}
