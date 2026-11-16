import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

/** After players join a team: how many contracts were sent automatically, and how many wait as drafts (?cs= / ?cd=). */
export async function ContractsNote({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const n = (k: string) => (typeof sp[k] === 'string' ? Number(sp[k]) || 0 : 0);
  const sent = n('cs'), drafts = n('cd');
  if (!sent && !drafts) return null;
  const t = await getTranslations('contract');
  return (
    <p role="status" className={`rounded-card p-3 font-semibold ${drafts ? 'bg-danger/10 text-danger' : 'bg-accent/15 text-pitch'}`} data-contracts-note={`${sent}/${drafts}`}>
      {sent ? t('autoSent', { count: sent }) : null}{sent && drafts ? ' ' : null}
      {drafts ? <>{t('autoDrafts', { count: drafts })} <Link href="/admin/contracts?status=draft" className="underline underline-offset-2">{t('autoOpenDrafts')}</Link></> : null}
    </p>
  );
}
