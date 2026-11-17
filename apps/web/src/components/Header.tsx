import { getTranslations } from 'next-intl/server';
import { SiteNav, type NavGroup } from './SiteNav';

// Main menu: four groups (Teams, Matches, Club, Join us). Each entry is [href, label key, description key].
const GROUPS = [
  ['teams', 'mn_teams', [['/team', 'au_m', 'md_men'], ['/women', 'au_w', 'md_women'], ['/juniors', 'au_j', 'md_juniors']]],
  ['matches', 'mn_matches', [['/calendar', 'n_cal', 'md_cal'], ['/#standings', 'mi_results', 'md_res']]],
  ['club', 'mn_club', [['/news', 'n_news', 'md_news'], ['/sponsors', 'mi_sp', 'md_sp'], ['/contact', 'n_contact', 'md_contact']]],
  ['join', 'mn_join', [['/join', 'au_join', 'md_join'], ['/join#tryout', 'mi_try', 'md_try'], ['/membership#fees', 'mi_fees', 'md_fees'], ['/membership#invoice', 'mi_pay', 'md_pay']]],
] as const;

// The member app is not live yet. Set NEXT_PUBLIC_APP_URL (for example https://app.afrofoot.club) to show the Sign in button.
const APP_URL = process.env.NEXT_PUBLIC_APP_URL;

export async function Header() {
  const [t, tn] = await Promise.all([getTranslations('site'), getTranslations('nav')]);
  const groups: NavGroup[] = GROUPS.map(([id, label, items]) => ({
    id, label: t(label), items: items.map(([href, l, d]) => ({ href, label: t(l), desc: t(d) })),
  }));
  return (
    <header className="sticky top-0 z-40">
      <SiteNav groups={groups} appUrl={APP_URL}
        labels={{ menu: t('mn_menu'), close: t('mn_close'), home: t('mn_home'), signin: t('signin'), language: tn('language') }} />
    </header>
  );
}
