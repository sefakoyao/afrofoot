import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { isAdminRole } from '@afrofoot/db';
import { MfaForm } from '@/components/MfaForm';
import { homeFor, requireMember } from '@/lib/auth';
import { safeNext } from '@/lib/paths';
import { getSupabase } from '@/lib/supabase/server';

export async function generateMetadata(): Promise<Metadata> { return { title: (await getTranslations('mfa'))('title') }; }

/**
 * Two-step sign-in (migration 0075). Admins confirm every sign-in with the 6-digit code from their authenticator app;
 * the first time they set it up here: scan the QR code (or type the key), then enter a code. Other members only come here
 * if they set it up themselves.
 */
export default async function MfaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const m = await requireMember('/mfa');
  const sp = await searchParams;
  const next = safeNext(Array.isArray(sp.next) ? sp.next[0] : sp.next) ?? homeFor(m.role);
  if (m.aal === 'aal2') redirect(next);
  const [t, supabase] = await Promise.all([getTranslations('mfa'), getSupabase()]);
  if (!supabase) return null;
  const { data: list } = await supabase.auth.mfa.listFactors();
  const verified = (list?.totp ?? []).find((f) => f.status === 'verified');
  if (!verified && !isAdminRole(m.role)) redirect(next);

  let setup: { factorId: string; qr: string; secret: string } | null = null;
  if (!verified) {
    // a fresh setup: earlier unfinished ones are removed first
    for (const f of list?.all ?? []) if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id });
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Afro Foot ${new Date().toISOString().slice(0, 10)}`, issuer: 'Afro Foot Club' });
    if (error || !data) {
      console.error('[mfa] enroll refused', { code: error?.code, message: error?.message });
      return <p role="alert" className="font-semibold text-danger">{t('enrollError')}</p>;
    }
    const qr = data.totp.qr_code.startsWith('data:') ? data.totp.qr_code : `data:image/svg+xml;utf8,${encodeURIComponent(data.totp.qr_code)}`;
    setup = { factorId: data.id, qr, secret: data.totp.secret };
  }
  const k = ['title', 'leadSetup', 'leadVerify', 'step1', 'step2', 'step3', 'apps', 'secretLabel', 'code', 'codeHint', 'verify', 'verifying', 'signOut', 'why', 'lost'] as const;
  const labels = Object.fromEntries(k.map((x) => [x, t(x)])) as Record<(typeof k)[number], string>;
  return <MfaForm factorId={setup?.factorId ?? verified!.id} setup={setup} next={next} email={m.email}
    labels={{ ...labels, errors: { code: t('e_code'), wrong: t('e_wrong'), failed: t('e_failed') } }} />;
}
