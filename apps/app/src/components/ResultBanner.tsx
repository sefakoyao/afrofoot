import { getTranslations } from 'next-intl/server';

/**
 * Shows the outcome of a form post that redirected with ?result=<key> (keys under the given namespace).
 * Only listed keys are shown, so an unknown or forged value shows nothing.
 */
const OK = new Set(['r_seasonCreated', 'r_currentSet', 'r_teamCreated', 'r_playerAdded', 'r_saved', 'r_playerRemoved', 'r_coachAdded', 'r_coachRemoved']);
const ERR = new Set(['r_invalid', 'r_name', 'r_dates', 'r_duplicate', 'r_notAllowed', 'r_error', 'r_shirt', 'r_shirtTaken', 'r_noName']);

export async function ResultBanner({ ns, result }: { ns: 'teams'; result: unknown }) {
  const key = typeof result === 'string' ? result : '';
  const t = await getTranslations(ns);
  if (OK.has(key)) return <p role="status" className="rounded-card bg-accent/15 p-3 font-semibold text-pitch">{t(key as 'r_saved')}</p>;
  if (ERR.has(key)) return <p role="alert" className="rounded-card bg-danger/10 p-3 font-semibold text-danger">{t(key as 'r_error')}</p>;
  return null;
}
