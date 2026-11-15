import { getTranslations } from 'next-intl/server';

/**
 * Shows the outcome of a form post that redirected with ?result=<key> (keys under the given namespace).
 * Only listed keys are shown, so an unknown or forged value shows nothing.
 */
const KEYS = {
  teams: {
    ok: ['r_seasonCreated', 'r_currentSet', 'r_teamCreated', 'r_playerAdded', 'r_saved', 'r_playerRemoved', 'r_coachAdded', 'r_coachRemoved'],
    err: ['r_invalid', 'r_name', 'r_dates', 'r_duplicate', 'r_notAllowed', 'r_error', 'r_shirt', 'r_shirtTaken', 'r_noName'],
  },
  inv: {
    ok: ['r_billingSaved', 'r_planCreated', 'r_saved', 'r_membershipAdded', 'r_autoOn', 'r_autoOff', 'r_markedPaid'],
    err: ['r_invalid', 'r_error', 'r_duplicate', 'r_notAllowed', 'r_billing', 'r_businessId', 'r_iban', 'r_bic', 'r_email', 'r_terms', 'r_lead', 'r_interest', 'r_planName', 'r_price', 'r_date', 'r_noSeason'],
  },
  coach: {
    ok: ['r_sessionCreated', 'r_sessionsCreated', 'r_sessionCancelled', 'r_attendanceSaved'],
    err: ['r_invalid', 'r_error', 'r_title', 'r_date', 'r_time', 'r_endAfterStart', 'r_repeat', 'r_notYourTeam', 'r_cancelled', 'r_tooEarly'],
  },
} as const;

export async function ResultBanner({ ns, result }: { ns: keyof typeof KEYS; result: unknown }) {
  const key = typeof result === 'string' ? result : '';
  const t = await getTranslations(ns);
  if ((KEYS[ns].ok as readonly string[]).includes(key)) return <p role="status" className="rounded-card bg-accent/15 p-3 font-semibold text-pitch">{t(key as never)}</p>;
  if ((KEYS[ns].err as readonly string[]).includes(key)) return <p role="alert" className="rounded-card bg-danger/10 p-3 font-semibold text-danger">{t(key as never)}</p>;
  return null;
}
