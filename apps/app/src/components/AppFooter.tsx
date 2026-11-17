import { getTranslations } from 'next-intl/server';
import { CRAFTED_BY, releaseLabel, yearNow } from '@afrofoot/ui/release';

/** Slim footer on every page of the member app: copyright, who built it, and the deployed release. */
export async function AppFooter() {
  const t = await getTranslations('common');
  const release = releaseLabel();
  return (
    <footer className="border-t border-line px-4 py-4 text-center text-xs text-muted" data-app-footer>
      <p className="flex flex-wrap justify-center gap-x-2 gap-y-1">
        <span>{t('footRights', { year: yearNow() })}</span><span aria-hidden="true">·</span>
        <span>{t('footCrafted', { company: CRAFTED_BY })}</span>
        {release ? <><span aria-hidden="true">·</span><span dir="ltr" className="tabular-nums" data-release>{t('footVersion')} {release}</span></> : null}
      </p>
    </footer>
  );
}
