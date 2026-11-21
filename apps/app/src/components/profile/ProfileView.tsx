import { isPlayerRole } from '@afrofoot/db';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { setReminderEmails, setWebsiteListing } from '@/app/actions/player';
import { MyShirtNumber } from '@/components/MyShirtNumber';
import type { Member } from '@/lib/auth';
import { loadPlayerSport } from '@/lib/player';
import { relationLabel } from '@/lib/relations';
import { getSupabase } from '@/lib/supabase/server';
import { PhotoForm } from './PhotoForm';
import { PlayerProfileForm } from './PlayerProfileForm';
import { ProfileForm } from './ProfileForm';

export type ProfileBack = '/account' | '/me/profile';
type Search = { website?: string; reminders?: string; result?: string };

/**
 * The member's one profile page, the same wherever it is opened (/account from the name in the header, /me/profile from
 * the player tabs): sign-in and role, name / phone / language, then for players and player-coaches every player detail
 * (sport details, shirt number, photo, website listing, reminders, contact and emergency details), then the password.
 * A coach and a player-coach therefore edit everything in one place.
 */
export async function ProfileView({ member, sp, back }: { member: Member; sp: Search; back: ProfileBack }) {
  const [t, tr] = await Promise.all([getTranslations('account'), getTranslations('role')]);
  const playing = isPlayerRole(member.role);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5" data-profile-view>
      <section className="rounded-card border border-line bg-raised p-6">
        <h1 className="font-display text-2xl font-extrabold">{t('title')}</h1>
        <p className="mt-1 text-muted">{t('lead')}</p>
        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          {member.email ? <div><dt className="text-muted">{t('email')}</dt><dd className="font-semibold"><bdi>{member.email}</bdi></dd><dd className="text-xs text-muted">{t('emailNote')}</dd></div>
            : <div><dt className="text-muted">{t('signInPhone')}</dt><dd className="font-semibold" dir="ltr" style={{ textAlign: 'start' }}><bdi>{member.phone}</bdi></dd><dd className="text-xs text-muted">{t('signInPhoneNote')}</dd></div>}
          <div><dt className="text-muted">{t('role')}</dt><dd className="font-semibold">{tr(member.role)}</dd></div>
        </dl>
      </section>
      <section className="rounded-card border border-line bg-raised p-6">
        <ProfileForm showPhone={!playing} initial={{ first_name: member.firstName, last_name: member.lastName, phone: member.phone ?? '', locale: member.locale }} />
      </section>
      {playing ? <PlayerSections member={member} sp={sp} back={back} /> : null}
      <section className="rounded-card border border-line bg-raised p-6">
        <h2 className="font-display text-lg font-extrabold">{t('passwordTitle')}</h2>
        <p className="mt-1 text-sm text-muted">{t('passwordLead')}</p>
        <Link href="/reset-password" className="mt-3 inline-flex min-h-11 items-center rounded-full border-2 border-fg px-5 font-display font-bold hover:bg-fg hover:text-raised">{t('changePassword')}</Link>
      </section>
    </div>
  );
}

/** The player part of the profile (players and player-coaches). */
async function PlayerSections({ member, sp, back }: { member: Member; sp: Search; back: ProfileBack }) {
  const [t, tm, tpos, trel, supabase] = await Promise.all([getTranslations('pp'), getTranslations('me'), getTranslations('position'), getTranslations('relation'), getSupabase()]);
  const sport = supabase ? await loadPlayerSport(supabase, member.id) : null;
  // own photo (storage, own folder): a short-lived signed address
  const { data: me } = supabase ? await supabase.from('players').select('id, photo_path, website_hidden').eq('profile_id', member.id).maybeSingle() : { data: null };
  const saved = sp.website === 'saved';
  const { data: prof } = supabase ? await supabase.from('profiles').select('reminder_emails, email').eq('id', member.id).maybeSingle() : { data: null };
  const remindersOn = prof?.reminder_emails !== false;
  const signed = supabase && me?.photo_path ? await supabase.storage.from('player-photos').createSignedUrl(me.photo_path, 3600) : null;
  const notSet = <span className="text-muted">{t('notSet')}</span>;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5" id="player" data-player-sections>
      {sport ? (
        <>
          {/* all sport details: what the club sets (read-only) and what the player fills in below */}
          <section className="rounded-card border border-line bg-raised p-6" aria-labelledby="sport-h" data-sport-details>
            <h2 id="sport-h" className="font-display text-xl font-extrabold">{t('detailsTitle')}</h2>
            <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div><dt className="text-muted">{t('team')}</dt>
                <dd className="font-semibold">{sport.teams.length ? sport.teams.map((x, i) => <span key={i} className="block"><bdi>{x.name}</bdi>{x.division ? <span className="font-normal text-muted"> · {x.division}</span> : null}</span>) : notSet}</dd></div>
              <div><dt className="text-muted">{t('position')}</dt><dd className="font-semibold">{sport.position ? tpos(sport.position) : notSet}</dd></div>
              <div><dt className="text-muted">{t('secondaryPosition')}</dt><dd className="font-semibold">{sport.secondaryPosition ? tpos(sport.secondaryPosition) : notSet}</dd></div>
              <div><dt className="text-muted">{t('shirt')}</dt><dd className="font-semibold" dir="ltr" style={{ textAlign: 'start' }}>{sport.shirt ? `#${sport.shirt}` : notSet}</dd></div>
              <div><dt className="text-muted">{t('foot')}</dt><dd className="font-semibold">{sport.preferredFoot ? t(`foot_${sport.preferredFoot}`) : notSet}</dd></div>
              <div><dt className="text-muted">{t('heightWeight')}</dt><dd className="font-semibold" dir="ltr" style={{ textAlign: 'start' }}>{sport.heightCm ? `${sport.heightCm} cm` : '–'} · {sport.weightKg ? `${sport.weightKg} kg` : '–'}</dd></div>
              <div><dt className="text-muted">{t('phone')}</dt><dd className="font-semibold">{sport.phone ? <bdi dir="ltr">{sport.phone}</bdi> : <span className="text-danger">{t('missing')}</span>}</dd></div>
              <div className="sm:col-span-2"><dt className="text-muted">{t('emergencyTitle')}</dt><dd className="font-semibold" data-emergency-summary>{sport.emergencyName
                ? <><bdi>{sport.emergencyName}</bdi>{sport.emergencyRelation ? <> ({relationLabel(trel, sport.emergencyRelation)})</> : null}{sport.emergencyPhone ? <> · <bdi dir="ltr">{sport.emergencyPhone}</bdi></> : null}</>
                : <span className="text-danger">{t('missing')}</span>}</dd></div>
            </dl>
            <p className="mt-3 text-xs text-muted">{t('clubSetNote')}</p>
          </section>
          {supabase && me?.id ? <MyShirtNumber db={supabase} playerId={me.id} result={sp.result} back={back} /> : null}
          <section className="rounded-card border border-line bg-raised p-6" aria-labelledby="photo-h">
            <h2 id="photo-h" className="mb-3 font-display text-lg font-extrabold">{t('photoTitle')}</h2>
            <PhotoForm current={signed?.data?.signedUrl ?? null} name={`${member.firstName} ${member.lastName}`.trim() || member.email || member.phone || ''} />
          </section>
          <section id="website" className="scroll-mt-24 rounded-card border border-line bg-raised p-6" aria-labelledby="web-h" data-website-listing={me && !me.website_hidden ? 'on' : 'off'}>
            <h2 id="web-h" className="font-display text-lg font-extrabold">{t('webTitle')}</h2>
            {saved ? <p role="status" className="mt-2 rounded-control bg-accent/15 px-3 py-2 text-sm font-semibold">{t('webSaved')}</p> : null}
            <p className="mt-2 font-semibold">{me && !me.website_hidden ? t('webOn') : t('webOff')}</p>
            <p className="mt-1 text-sm text-muted">{t('webWhat')}</p>
            <form action={setWebsiteListing} className="mt-3">
              <input type="hidden" name="show" value={me && !me.website_hidden ? 'off' : 'on'} /><input type="hidden" name="back" value={back} />
              <button className={`inline-flex min-h-11 items-center rounded-full px-5 font-display font-bold ${me && !me.website_hidden ? 'border-2 border-fg hover:bg-fg hover:text-raised' : 'bg-accent text-on-accent hover:brightness-110'}`} data-website-toggle>
                {me && !me.website_hidden ? t('webHide') : t('webShow')}
              </button>
            </form>
          </section>
          <section id="reminders" className="scroll-mt-24 rounded-card border border-line bg-raised p-6" aria-labelledby="rem-h" data-reminders={remindersOn ? 'on' : 'off'}>
            <h2 id="rem-h" className="font-display text-lg font-extrabold">{tm('remTitle')}</h2>
            {sp.reminders === 'saved' ? <p role="status" className="mt-2 rounded-control bg-accent/15 px-3 py-2 text-sm font-semibold">{t('webSaved')}</p> : null}
            <p className="mt-2 font-semibold">{remindersOn ? tm('remOn') : tm('remOff')}</p>
            <p className="mt-1 text-sm text-muted">{prof?.email ? tm('remWhat') : tm('remNoEmail')}</p>
            <form action={setReminderEmails} className="mt-3">
              <input type="hidden" name="on" value={remindersOn ? 'off' : 'on'} /><input type="hidden" name="back" value={back} />
              <button className={`inline-flex min-h-11 items-center rounded-full px-5 font-display font-bold ${remindersOn ? 'border-2 border-fg hover:bg-fg hover:text-raised' : 'bg-accent text-on-accent hover:brightness-110'}`} data-reminders-toggle>
                {remindersOn ? tm('remTurnOff') : tm('remTurnOn')}
              </button>
            </form>
          </section>
          <section className="rounded-card border border-line bg-raised p-6" aria-labelledby="edit-h">
            <h2 id="edit-h" className="sr-only">{t('edit')}</h2>
            <PlayerProfileForm initial={{
              preferred_foot: sport.preferredFoot ?? '', height_cm: sport.heightCm?.toString() ?? '', weight_kg: sport.weightKg?.toString() ?? '',
              phone: sport.phone ?? '', emergency_name: sport.emergencyName ?? '', emergency_relation: sport.emergencyRelation ?? '', emergency_phone: sport.emergencyPhone ?? '',
            }} />
          </section>
        </>
      ) : <p role="alert" className="rounded-card border border-line bg-raised p-6">{t('e_noPlayer')}</p>}
    </div>
  );
}
