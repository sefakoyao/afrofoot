import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Hero } from '@/components/Page';
import { getPublicClient } from '@/lib/supabase';
import { pageMeta } from '@/lib/seo';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const [t, ts] = await Promise.all([getTranslations({ locale, namespace: 'privacyPolicy' }), getTranslations({ locale, namespace: 'site' })]);
  return pageMeta({ locale, path: '/privacy', title: t('title'), description: ts('seo_privacy') });
}

/** Rendered on each visit so the club's details (billing settings) are always current; one small query. */
export const dynamic = 'force-dynamic';

/** Contact address on the site when the club's billing details (Admin → Invoices) have no email yet. */
const FALLBACK_EMAIL = 'info@afrofoot.club';
const SECTIONS = ['controller', 'data', 'purposes', 'public', 'who', 'processors', 'retention', 'rights', 'delete', 'children', 'cookies', 'security', 'changes'] as const;

/** The club's own details from its public billing settings (migration 0027), so they are kept in one place. */
async function clubDetails() {
  const db = getPublicClient();
  const { data } = db ? await db.from('site_settings').select('value').eq('key', 'billing').maybeSingle() : { data: null };
  const v = (data?.value ?? {}) as Record<string, unknown>;
  const s = (k: string) => (typeof v[k] === 'string' ? (v[k] as string).trim() : '');
  return { email: s('email') || FALLBACK_EMAIL, businessId: s('business_id'), address: [s('street'), s('postal_city')].filter(Boolean).join(', ') };
}

/**
 * Privacy policy (GDPR), linked from the footer, the membership and tryout forms and the member app's sign-in page.
 * `#delete` is the data deletion instructions address Facebook Login asks for.
 */
export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, club] = await Promise.all([getTranslations('privacyPolicy'), clubDetails()]);
  const mail = (chunks: ReactNode) => <a href={`mailto:${club.email}`} className="font-semibold text-pitch underline" dir="ltr">{chunks}</a>;
  const list = (key: string) => (
    <ul className="mt-3 grid list-disc gap-2 ps-6 leading-relaxed">{t(key as 'data_items').split('\n').map((line) => <li key={line}>{line}</li>)}</ul>
  );
  const body: Record<(typeof SECTIONS)[number], ReactNode> = {
    controller: <>
      <p>{t('controller')}</p>
      {club.businessId || club.address ? <p className="mt-2 text-muted">{club.businessId ? t('controller_details', { id: club.businessId }) : null}{club.businessId && club.address ? ' · ' : ''}{club.address}</p> : null}
      <p className="mt-2">{t.rich('contact', { email: club.email, mail })}</p>
    </>,
    data: <><p>{t('data_lead')}</p>{list('data_items')}<p className="mt-3 rounded-card bg-surface p-3">{t('data_health')}</p></>,
    purposes: list('purposes_items'),
    public: <p>{t('public_text')}</p>,
    who: list('who_items'),
    processors: <>{list('processors_items')}<p className="mt-3">{t('processors_transfer')}</p></>,
    retention: list('retention_items'),
    rights: <><p>{t('rights_lead')}</p>{list('rights_items')}<p className="mt-3">{t.rich('rights_how', { email: club.email, mail })}</p></>,
    delete: <p>{t.rich('delete_text', { email: club.email, mail })}</p>,
    children: <p>{t('children_text')}</p>,
    cookies: <p>{t('cookies_text')}</p>,
    security: <p>{t('security_text')}</p>,
    changes: <p>{t('changes_text')}</p>,
  };
  return (
    <>
      <Hero title={t('title')} lead={t('updated')} />
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <nav aria-label={t('contents')} className="lg:sticky lg:top-28 lg:self-start">
          <p className="text-xs font-bold uppercase tracking-widest text-muted">{t('contents')}</p>
          <ol className="mt-2 grid gap-1 text-sm">
            {SECTIONS.map((s) => <li key={s}><a href={`#${s}`} className="text-pitch underline-offset-2 hover:underline">{t(`h_${s}`)}</a></li>)}
          </ol>
        </nav>
        <article className="grid max-w-3xl gap-8 text-base leading-relaxed" data-privacy>
          <p className="text-lg">{t('intro')}</p>
          {SECTIONS.map((s) => (
            <section key={s} id={s} aria-labelledby={`${s}-h`} className="scroll-mt-28">
              <h2 id={`${s}-h`} className="font-display text-2xl font-extrabold text-pitch">{t(`h_${s}`)}</h2>
              <div className="mt-2">{body[s]}</div>
            </section>
          ))}
        </article>
      </div>
    </>
  );
}
