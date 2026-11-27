import 'server-only';
import { getTranslations } from 'next-intl/server';

/** The latest birth date the forms accept: 5 years ago today (Helsinki), as the database does (migration 0073). */
export const maxBirthDate = () => { const t = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Helsinki' }).format(new Date()); return `${Number(t.slice(0, 4)) - 5}${t.slice(4)}`; };

/** Texts for the player's own birth date form (components/birth/BirthDate). */
export async function birthLabels() {
  const t = await getTranslations('birth');
  return {
    title: t('title'), lead: t('lead'), later: t('later'), label: t('label'), hint: t('hint'), save: t('save'), saved: t('saved'),
    errors: { range: t('e_range'), already: t('e_already'), noPlayer: t('e_noPlayer'), notReady: t('e_notReady'), failed: t('e_failed') },
  };
}
