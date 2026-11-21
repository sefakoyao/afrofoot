import { getTranslations } from 'next-intl/server';
import type { Contract } from '@/lib/contracts';
import { signatureId } from '@/lib/esign';
import { dateFormats } from '@/lib/format';
import { relationLabel } from '@/lib/relations';
import { SignatureMark } from './SignatureMark';

/** Who signed and when, plus the fingerprint of the text that was signed (shown to the player and to admins). */
export async function ContractSignatures({ c }: { c: Contract }) {
  const [t, trel, fmt] = await Promise.all([getTranslations('contract'), getTranslations('relation'), dateFormats()]);
  const at = (iso: string | null) => (iso ? fmt.dateTime.format(new Date(iso)) : null);
  const Sig = ({ who, party, name, title, when, waiting, extra }: { who: string; party: 'player' | 'club' | 'guardian'; name: string | null; title?: string | null; when: string | null; waiting: string; extra?: React.ReactNode }) => {
    const ref = signatureId(c, party);
    return (
      <div className="rounded-card bg-surface p-4" data-signature={party}>
        <p className="text-xs font-bold uppercase tracking-widest text-muted">{who}</p>
        {name && when ? (
          <>
            <SignatureMark name={name} />
            <p className="mt-2 font-display font-extrabold"><bdi>{name}</bdi></p>
            {title ? <p className="text-sm font-semibold" data-signature-title><bdi>{title}</bdi></p> : null}
            <p className="text-sm text-muted">{t('signedAt', { date: when })}</p>
            {ref ? <p className="text-xs text-muted" dir="ltr" style={{ textAlign: 'start' }} data-signature-id>{t('signatureId')} <span className="font-mono">{ref}</span></p> : null}
            {extra}
          </>
        ) : (
          <>
            <SignatureMark name={null} placeholder="" size="md" />
            <p className="mt-2 text-muted">{waiting}</p>
          </>
        )}
      </div>
    );
  };
  return (
    <section className="rounded-card border border-line bg-raised p-6" aria-labelledby="sig-h" data-signatures>
      <h2 id="sig-h" className="font-display text-xl font-extrabold">{t('signatures')}</h2>
      {c.is_minor ? <p className="mt-2"><span className="rounded-full bg-gold px-3 py-1 text-xs font-bold text-ink-950" data-under-18>{t('under18')}</span></p> : null}
      <div className={`mt-3 grid gap-3 ${c.is_minor ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
        <Sig who={t('sigPlayer')} party="player" name={c.player_signed_name} when={at(c.player_signed_at)} waiting={c.status === 'declined' ? t('declinedAt', { date: at(c.declined_at) ?? '' }) : t('notSigned')} />
        {c.is_minor ? <Sig who={t('sigGuardian')} party="guardian" name={c.guardian_signed_name ?? null} when={at(c.guardian_signed_at ?? null)} waiting={t('notSigned')}
          title={c.guardian_relation ? relationLabel(trel, c.guardian_relation) : null}
          extra={<p className="mt-1 text-sm" data-guardian-contact><bdi dir="ltr">{c.guardian_phone}</bdi>{c.guardian_email ? <> · <bdi dir="ltr">{c.guardian_email}</bdi></> : null}</p>} /> : null}
        <Sig who={t('sigClub')} party="club" name={c.club_signed_name} title={c.club_signed_title} when={at(c.club_signed_at)} waiting={t('notSigned')} />
      </div>
      {c.decline_reason ? <p className="mt-3 text-sm">{t('reason')}: <bdi>{c.decline_reason}</bdi></p> : null}
      {c.terminated_on ? <p className="mt-3 text-sm">{t('terminatedInfo', { date: fmt.date.format(new Date(`${c.terminated_on}T12:00:00Z`)) })}{c.termination_reason ? <> · <bdi>{c.termination_reason}</bdi></> : null}</p> : null}
      {c.sent_at ? <p className="mt-3 text-xs text-muted">{t('sentAt', { date: at(c.sent_at) ?? '' })}</p> : null}
      {c.player_signed_at ? <p className="mt-3 text-xs text-muted">{t('esignNote')}</p> : null}
      {c.body_sha256 ? <p className="mt-1 break-all text-xs text-muted" dir="ltr">{t('fingerprint')}: <span className="font-mono">{c.body_sha256}</span></p> : null}
    </section>
  );
}
