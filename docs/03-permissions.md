# Permission matrix (enforced by RLS; mirrored in `packages/db/src/roles.ts`)
Legend: ● full · ◐ own team / own data · ○ read only · — none

**Player-coach** (migration 0045): has both the Player and the Coach column. Exceptions on their own player record:
it is never "coached" by themselves (no self-evaluation, own goals or own private data as coach), only the player
columns can be changed (no own fee exemption), own event replies close at kick-off, and the fee block applies.
Database helpers: `app.is_coach()` (coach, player_coach) and `app.is_playing()` (player, player_coach).

| Data | Anonymous | Player | Coach | Club admin | Super admin |
|---|---|---|---|---|---|
| Published pages, news, sponsors, public settings | ○ | ○ | ○ | ● | ● |
| Public player list (consented) / public staff / fixtures / records | ○ | ○ | ○ | ● | ● |
| Contact & join forms | submit | submit | submit | ● read/handle | ● |
| Own profile | — | ◐ edit name/phone/locale | ◐ | ● | ● |
| Role / status of users | — | — | — | ● (not admins) | ● (incl. admins) |
| Players (core) | — | ◐ own (limited fields) | ◐ own teams (read) | ● | ● |
| Contact & emergency data | — | ◐ own | ◐ own teams (read) | ● | ● |
| Medical notes | — | ◐ own | — | ● | ● |
| Teams, seasons, locations, plans | — | ○ | ○ | ● | ● |
| Roster (names, numbers) | — | ◐ teammates via view | ◐ | ● | ● |
| Training programs & sessions | — | ◐ own team read | ◐ own teams write | ● | ● |
| Attendance | — | ◐ reply availability only | ◐ mark | ● | ● |
| Matches, results, stats | — | ◐ own team read | ◐ own teams write | ● | ● |
| Squad | — | ◐ after publish | ◐ | ● | ● |
| Evaluations | — | ◐ only when shared | ◐ write own, read team | ● read | ● read |
| Memberships & payments | — | ◐ own read | — | ● | ● |
| Expenses & finance summary | — | — | — | ● | ● |
| Announcements | — | ◐ audience read | ◐ team drafts + publish | ● | ● |
| Notifications | — | ◐ own (mark read) | ◐ own | ◐ own | ◐ own |
| Audit log | — | — | — | ○ read | ○ read |
