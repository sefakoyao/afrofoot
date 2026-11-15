import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { agreeToConduct } from '@/app/actions/conduct';
import { ConductText } from '@/components/ConductText';
import { requireArea } from '@/lib/auth';
import { loadConductStatus } from '@/lib/conduct';
import { dateFormats } from '@/lib/format';
import { getSupabase } from '@/lib/supabase/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('conduct'))('title') };
}

const RESULTS = ['r_tick', 'r_changed', 'r_error'];

/** Read the club's Code of Conduct and agree to it (once per version). The official text is in English. */
export default async function ConductPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const member = await requireArea('me');
  const sp = await searchParams;
  const [t, fmt, supabase] = await Promise.all([getTranslations('conduct'), dateFormats(), getSupabase()]);
  const { version, agreedAt } = supabase ? await loadConductStatus(supabase, member.id) : { version: null, agreedAt: null };
  const result = typeof sp.result === 'string' && RESULTS.includes(sp.result) ? sp.result : '';
  if (!version) return <p className="rounded-card border border-line bg-raised p-6">{t('none')}</p>;
  return (
    <div className="mx-auto grid max-w-3xl grid-cols-[minmax(0,1fr)] gap-5">
      <Link href="/me/membership" className="text-sm font-semibold text-pitch underline underline-offset-2">← {t('back')}</Link>
      <article className="rounded-card border border-line bg-raised p-6" aria-labelledby="coc-title">
        <p className="text-sm text-muted">Afro Foot Club ry</p>
        <h1 id="coc-title" className="font-display text-2xl font-extrabold">{version.title}</h1>
        {version.label ? <p className="text-sm text-muted">{version.label}</p> : null}
        <p className="mt-3 rounded-card bg-surface p-3 text-sm">{t('englishNote')}
          {version.pdfPath ? <> <a href={version.pdfPath} target="_blank" rel="noopener" className="font-semibold text-pitch underline">{t('downloadPdf')}</a></> : null}</p>
        <div className="mt-4"><ConductText body={version.body} /></div>
      </article>

      <section className="rounded-card border-2 border-accent bg-raised p-6" aria-labelledby="agree-h" id="agree">
        <h2 id="agree-h" className="font-display text-xl font-extrabold">{t('agreeTitle')}</h2>
        {result ? <p role="alert" className="mt-3 rounded-card bg-danger/10 p-3 font-semibold text-danger">{t(result as 'r_tick')}</p> : null}
        {agreedAt ? (
          <p role="status" className="mt-3 rounded-card bg-accent/15 p-3 font-semibold text-pitch" data-agreed>{t('agreedOn', { date: fmt.dateTime.format(new Date(agreedAt)) })}</p>
        ) : (
          <form action={agreeToConduct} className="mt-3 grid gap-4">
            <input type="hidden" name="version_id" value={version.id} />
            <label className="flex items-start gap-3 text-base">
              <input type="checkbox" name="agree" required className="mt-1 size-6 shrink-0 accent-[rgb(var(--accent))]" />
              <span>{t('checkbox', { name: `${member.firstName} ${member.lastName}`.trim() || member.email })}</span>
            </label>
            <button className="min-h-12 rounded-full bg-accent px-6 font-display font-bold text-on-accent hover:brightness-110 sm:justify-self-start">{t('agreeButton')}</button>
            <p className="text-xs text-muted">{t('recordNote')}</p>
          </form>
        )}
      </section>
    </div>
  );
}
