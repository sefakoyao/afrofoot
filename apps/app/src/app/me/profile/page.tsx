import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireArea } from '@/lib/auth';
import { loadPlayerSport } from '@/lib/player';
import { getSupabase } from '@/lib/supabase/server';
import { PhotoForm } from './PhotoForm';
import { PlayerProfileForm } from './PlayerProfileForm';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('pp'))('title') };
}

export default async function PlayerProfilePage() {
  const member = await requireArea('me');
  const [t, tpos, supabase] = await Promise.all([getTranslations('pp'), getTranslations('position'), getSupabase()]);
  const sport = supabase ? await loadPlayerSport(supabase, member.id) : null;
  // own photo (storage, own folder): a short-lived signed address
  const { data: me } = supabase ? await supabase.from('players').select('photo_path').eq('profile_id', member.id).maybeSingle() : { data: null };
  const signed = supabase && me?.photo_path ? await supabase.storage.from('player-photos').createSignedUrl(me.photo_path, 3600) : null;
  return (
    <div className="mx-auto grid max-w-2xl grid-cols-[minmax(0,1fr)] gap-5">
      <Link href="/me" className="text-sm font-semibold text-pitch underline underline-offset-2">← {t('back')}</Link>
      <section className="rounded-card border border-line bg-raised p-6">
        <h1 className="font-display text-2xl font-extrabold">{t('title')}</h1>
        <p className="mt-1 text-muted">{t('lead')}</p>
        {sport ? (
          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-muted">{t('position')}</dt><dd className="font-semibold">{sport.position ? tpos(sport.position) : '–'}{sport.secondaryPosition ? ` · ${tpos(sport.secondaryPosition)}` : ''}</dd>
              <dd className="text-xs text-muted">{t('positionNote')}</dd></div>
            <div><dt className="text-muted">{t('shirt')}</dt><dd className="font-semibold">{sport.shirt ?? '–'}</dd></div>
          </dl>
        ) : <p role="alert" className="mt-4 rounded-card bg-line/60 p-3">{t('e_noPlayer')}</p>}
      </section>
      {sport ? (
        <section className="rounded-card border border-line bg-raised p-6" aria-labelledby="photo-h">
          <h2 id="photo-h" className="mb-3 font-display text-lg font-extrabold">{t('photoTitle')}</h2>
          <PhotoForm current={signed?.data?.signedUrl ?? null} name={`${member.firstName} ${member.lastName}`.trim() || member.email} />
        </section>
      ) : null}
      {sport ? (
        <section className="rounded-card border border-line bg-raised p-6">
          <PlayerProfileForm initial={{
            preferred_foot: sport.preferredFoot ?? '', height_cm: sport.heightCm?.toString() ?? '', weight_kg: sport.weightKg?.toString() ?? '',
            phone: sport.phone ?? '', emergency_name: sport.emergencyName ?? '', emergency_relation: sport.emergencyRelation ?? '', emergency_phone: sport.emergencyPhone ?? '',
          }} />
        </section>
      ) : null}
    </div>
  );
}
