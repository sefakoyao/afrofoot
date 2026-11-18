import { getTranslations } from 'next-intl/server';
import type { Contract } from '@/lib/contracts';
import { signatureId } from '@/lib/esign';
import { dateFormats } from '@/lib/format';
import { SignatureMark } from './SignatureMark';

/** Who signed and when, plus the fingerprint of the text that was signed (shown to the player and to admins). */
export async function ContractSignatures({ c }: { c: Contract }) {
  const [t, fmt] = await Promise.all([getTranslations('contract'), dateFormats()]);
  const at = (iso: string | null) => (iso ? fmt.dateTime.format(new Date(iso)) : null);
  const Sig = ({ who, party, name, when, waiting }: { who: string; party: 'player' | 'club'; name: string | null; when: string | null; waiting: string }) => {
    const ref = signatureId(c, party);
    return (
      <div className="rounded-card bg-surface p-4" data-signature={party}>
        <p className="text-xs font-bold uppercase tracking-widest text-muted">{who}</p>
        {name && when ? (
          <>
            <SignatureMark name={name} />
            <p className="mt-2 font-display font-extrabold"><bdi>{name}</bdi></p>
            <p className="text-sm text-muted">{t('signedAt', { date: when })}</p>
            {ref ? <p className="text-xs text-muted" dir="ltr" style={{ textAlign: 'start' }} data-signature-id>{t('signatureId')} <span className="font-mono">{ref}</span></p> : null}
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
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Sig who={t('sigPlayer')} party="player" name={c.player_signed_name} when={at(c.player_signed_at)} waiting={c.status === 'declined' ? t('declinedAt', { date: at(c.declined_at) ?? '' }) : t('notSigned')} />
        <Sig who={t('sigClub')} party="club" name={c.club_signed_name} when={at(c.club_signed_at)} waiting={t('notSigned')} />
      </div>
      {c.decline_reason ? <p className="mt-3 text-sm">{t('reason')}: <bdi>{c.decline_reason}</bdi></p> : null}
      {c.terminated_on ? <p className="mt-3 text-sm">{t('terminatedInfo', { date: fmt.date.format(new Date(`${c.terminated_on}T12:00:00Z`)) })}{c.termination_reason ? <> · <bdi>{c.termination_reason}</bdi></> : null}</p> : null}
      {c.sent_at ? <p className="mt-3 text-xs text-muted">{t('sentAt', { date: at(c.sent_at) ?? '' })}</p> : null}
      {c.player_signed_at ? <p className="mt-3 text-xs text-muted">{t('esignNote')}</p> : null}
      {c.body_sha256 ? <p className="mt-1 break-all text-xs text-muted" dir="ltr">{t('fingerprint')}: <span className="font-mono">{c.body_sha256}</span></p> : null}
    </section>
  );
}
