import { getTranslations } from 'next-intl/server';

/**
 * Shows the outcome of a form post that redirected with ?result=<key> (keys under the given namespace).
 * Only listed keys are shown, so an unknown or forged value shows nothing.
 */
const KEYS = {
  teams: {
    ok: ['r_seasonCreated', 'r_currentSet', 'r_teamCreated', 'r_playerAdded', 'r_playersAdded', 'r_objectivesSaved', 'r_teamUpdated', 'r_saved', 'r_playerRemoved', 'r_coachAdded', 'r_coachRemoved'],
    err: ['r_invalid', 'r_name', 'r_dates', 'r_duplicate', 'r_notAllowed', 'r_error', 'r_shirt', 'r_shirtTaken', 'r_noName', 'r_playersAddedSome', 'r_pickNone'],
  },
  inv: {
    ok: ['r_billingSaved', 'r_planCreated', 'r_saved', 'r_membershipAdded', 'r_autoOn', 'r_autoOff', 'r_markedPaid'],
    err: ['r_invalid', 'r_error', 'r_duplicate', 'r_notAllowed', 'r_billing', 'r_businessId', 'r_iban', 'r_bic', 'r_email', 'r_terms', 'r_lead', 'r_interest', 'r_planName', 'r_price', 'r_date', 'r_noSeason'],
  },
  coach: {
    ok: ['r_sessionCreated', 'r_sessionsCreated', 'r_sessionCancelled', 'r_attendanceSaved'],
    err: ['r_invalid', 'r_error', 'r_title', 'r_date', 'r_time', 'r_endAfterStart', 'r_repeat', 'r_notYourTeam', 'r_cancelled', 'r_tooEarly'],
  },
  match: {
    ok: ['r_matchCreated', 'r_protocolSaved', 'r_planSaved', 'r_styleApplied', 'r_lineupSaved', 'r_published', 'r_unpublished', 'r_evAdded', 'r_evVoided', 'r_kickoff', 'r_half_time', 'r_second_half', 'r_full_time'],
    err: ['r_invalid', 'r_error', 'r_notYourTeam', 'r_opponent', 'r_division', 'r_date', 'r_time', 'r_protocolTimes', 'r_planLong', 'r_lineupInvalid', 'r_lineupLocked', 'r_notRoster', 'r_rotationInvalid',
      'r_evInvalid', 'r_evPlayer', 'r_evNotSquad', 'r_evNotOnPitch', 'r_evAlreadyPlayed', 'r_evOnlySub', 'r_evFinished', 'r_phaseOrder'],
  },
  events: {
    ok: ['e_created', 'e_cancelled', 'e_restored', 'e_trainingCreated', 'e_matchCreated'],
    err: ['e_invalid', 'e_error', 'e_title', 'e_date', 'e_time', 'e_end', 'e_long', 'e_meet', 'e_location', 'e_notYours', 'e_team', 'e_division', 'e_sameDay'],
  },
  contract: {
    ok: ['r_created', 'r_saved', 'r_sent', 'r_countersigned', 'r_cancelled', 'r_terminated', 'r_deleted', 'r_templateSaved', 'r_signed', 'r_declined', 'r_settingsSaved', 'r_refilled'],
    err: ['r_invalid', 'r_error', 'r_dates', 'r_blanks', 'r_refilledBlanks', 'r_overlap', 'r_notAllowed', 'r_name', 'r_tick', 'r_gone', 'r_noPlayer', 'r_reason'],
  },
} as const;

export async function ResultBanner({ ns, result }: { ns: keyof typeof KEYS; result: unknown }) {
  const key = typeof result === 'string' ? result : '';
  const t = await getTranslations(ns);
  if ((KEYS[ns].ok as readonly string[]).includes(key)) return <p role="status" className="rounded-card bg-accent/15 p-3 font-semibold text-pitch">{t(key as never)}</p>;
  if ((KEYS[ns].err as readonly string[]).includes(key)) return <p role="alert" className="rounded-card bg-danger/10 p-3 font-semibold text-danger">{t(key as never)}</p>;
  return null;
}
