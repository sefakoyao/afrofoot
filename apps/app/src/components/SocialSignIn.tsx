import { getTranslations } from 'next-intl/server';
import { signInWithProvider } from '@/app/actions/auth';
import type { SocialProvider } from '@/lib/auth-providers';

/** Shown under the email form, after an "or" line, so messages (approval, fees) stay at the top. */
/** Official marks, unchanged as the providers' brand rules require (Google's G keeps its four colours). */
const Mark = ({ p }: { p: SocialProvider }) => p === 'google' ? (
  <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
) : (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path fill="#1877F2" d="M24 12.07C24 5.41 18.63 0 12 0S0 5.41 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.04V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.49h-2.8V24C19.62 23.1 24 18.1 24 12.07z" />
    <path fill="#fff" d="M16.67 15.56l.53-3.49h-3.33V9.81c0-.96.47-1.89 1.96-1.89h1.51V4.95s-1.37-.24-2.68-.24c-2.74 0-4.53 1.67-4.53 4.69v2.66H7.08v3.49h3.04V24c.61.1 1.24.14 1.88.14s1.27-.05 1.88-.14v-8.44h2.79z" />
  </svg>
);

/**
 * "Continue with Google / Facebook" on the sign-in page. Plain forms posting to a server action, so they work without
 * JavaScript. Only providers switched on in Supabase are shown (enabledProviders); with none, nothing is shown.
 */
export async function SocialSignIn({ providers, next }: { providers: SocialProvider[]; next?: string }) {
  if (!providers.length) return null;
  const t = await getTranslations('auth');
  return (
    <div className="mt-6 grid gap-3" data-social>
      <p className="flex items-center gap-3 text-sm text-muted"><span aria-hidden className="h-px flex-1 bg-line" />{t('orContinue')}<span aria-hidden className="h-px flex-1 bg-line" /></p>
      {providers.map((p) => (
        <form key={p} action={signInWithProvider}>
          <input type="hidden" name="provider" value={p} />
          {next ? <input type="hidden" name="next" value={next} /> : null}
          <button data-provider={p} className="flex min-h-12 w-full items-center justify-center gap-3 rounded-full border-2 border-line bg-raised px-5 font-display font-bold text-fg hover:border-fg">
            <Mark p={p} />{p === 'google' ? t('continueGoogle') : t('continueFacebook')}
          </button>
        </form>
      ))}
    </div>
  );
}
