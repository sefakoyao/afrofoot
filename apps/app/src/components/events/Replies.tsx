import { getTranslations } from 'next-intl/server';

/** One player's answer to a training or game invitation (session_attendance / match_availability, migration 0029). */
export interface ReplyRow { player_id: string; name: string; availability: string; note?: string | null }

/**
 * Who signed in, who signed out (with their note) and who has not answered yet, for coaches and admins.
 * The summary line counts them against everyone invited (the team's roster when the event was made); the names open below.
 */
export async function Replies({ rows, open = false }: { rows: ReplyRow[]; open?: boolean }) {
  const t = await getTranslations('coach');
  const byName = (a: ReplyRow, b: ReplyRow) => a.name.localeCompare(b.name);
  const yes = rows.filter((r) => r.availability === 'yes').sort(byName);
  const no = rows.filter((r) => r.availability === 'no').sort(byName);
  const none = rows.filter((r) => r.availability !== 'yes' && r.availability !== 'no').sort(byName);
  const groups = [
    { key: 'in', title: t('groupIn'), list: yes, tone: 'text-pitch' },
    { key: 'out', title: t('groupOut'), list: no, tone: 'text-danger' },
    { key: 'none', title: t('groupNone'), list: none, tone: 'text-muted' },
  ];
  return (
    <details open={open} className="group mt-1" data-replies={`${yes.length}/${no.length}/${none.length}/${rows.length}`}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-1.5 text-sm">
        <span className="rounded-full bg-accent/20 px-2.5 py-0.5 font-bold text-pitch">{t('repliesIn', { count: yes.length })}</span>
        <span className="rounded-full bg-danger/10 px-2.5 py-0.5 font-bold text-danger">{t('repliesOut', { count: no.length })}</span>
        <span className="rounded-full bg-line px-2.5 py-0.5 font-bold">{t('repliesNone', { count: none.length })}</span>
        <span className="text-muted">{t('repliesInvited', { count: rows.length })}</span>
        {rows.length ? <span className="ms-1 font-semibold text-pitch underline underline-offset-2 group-open:hidden">{t('showNames')}</span> : null}
        {rows.length ? <span className="ms-1 hidden font-semibold text-pitch underline underline-offset-2 group-open:inline">{t('hideNames')}</span> : null}
      </summary>
      {rows.length ? (
        <div className="mt-2 grid gap-3 rounded-control bg-surface p-3 text-sm sm:grid-cols-3">
          {groups.map((g) => (
            <div key={g.key} data-reply-group={g.key}>
              <p className={`font-bold ${g.tone}`}>{g.title} ({g.list.length})</p>
              {g.list.length ? (
                <ul className="mt-1 grid gap-0.5">
                  {g.list.map((r) => (
                    <li key={r.player_id} data-reply-name={r.name}><bdi className="font-semibold">{r.name}</bdi>{r.note ? <span className="text-muted"> · “<bdi>{r.note}</bdi>”</span> : null}</li>
                  ))}
                </ul>
              ) : <p className="mt-1 text-muted">–</p>}
            </div>
          ))}
        </div>
      ) : null}
    </details>
  );
}
