# Design system

**Direction (updated 13 Nov): light theme, colours of the official logo.** The logo (black shield, green AFRO FOOT lettering, green top band, ivory lion) sets the palette: **green, black and white**. **No yellow.** White / off-white surfaces, near-black text, **logo green** (#3DAF2C) for primary buttons and highlights (with black text), **dark green** (#2A8A1C) for links and text accents, **black** for the top bar and footer. No dark mode in v1.

| Token | Value | Use |
|---|---|---|
| paper-100 / paper-50 | #F7F6F0 / #FFFFFF | page / cards (logo ivory is #F8F4EC) |
| ink-950 | #0A0A0A | top bar, footer, text (#101510) |
| green-500 | #3DAF2C (sampled from logo) | primary button fill, highlights, chart fill |
| green-600 / 700 | #2A8A1C / #1F6B14 | links, headings accents, success (≥4.5:1 on white) |
| green-100 / 300 | #E3F5DF / #8FD582 | tints, badges, stripe end |
| warning / danger / info | #B7791F / #C0392B / #5B8DEF | status only, never brand |

**Logo:** `packages/ui/assets/afc-logo.png` (transparent, 640 px) and `apps/*/public/{afc-logo,icon}.png` (favicon). Use on white or ivory; on the black bar/footer it works as is (shield is black with a white keyline). Keep clear space of 1/8 of the logo height; never recolour or stretch.
**Where:** `packages/ui/src/tokens.ts` and `styles.css`; both apps update from them.

**Type:** Saira (display, uppercase headings, numbers) + Inter (body), via `next/font`. Scale 12/14/16/18/24/32/48/72.

**Four experiences** (set `data-surface` on `<body>`):
| Surface | Density | Navigation | Character |
|---|---|---|---|
| public | airy | top bar + footer | editorial, big photography, green highlights |
| admin | compact | left sidebar | tables, filters, bulk actions |
| coach | comfortable | bottom tabs | one-handed, pitch-side: attendance, squad builder |
| player | comfortable | bottom tabs | personal card, next events, one-tap availability |

**Required component states** (every data component): loading skeleton, empty (with action), error (with retry), success toast, disabled.
**Accessibility:** WCAG AA contrast, visible green focus ring, 44px touch targets on coach/player, reduced-motion respected, labelled form fields with inline validation.
**Reusable components (built from Phase 2):** Button, Field/Input/Select/DateTime, DataTable, Card, StatTile, Badge, Tabs, Dialog, Toast, EmptyState, ErrorState, Skeleton, Calendar, PlayerCard, MatchCard, FormShell (zod + server action).

**Trilingual UI (EN / FI / FR):** language switcher in the public header and in the app account menu; Finnish strings run ~30% longer, so buttons and table headers wrap instead of truncating; dates, numbers and euros use `Intl` per locale (Europe/Helsinki time zone). See docs/04-i18n.md.

## Visual direction v2 — "big-club editorial" (inspired by hjk.fi)

Colours unchanged: green #3DAF2C (accent), black, white. No yellow.
- **Header**: black utility bar (audience links Men/Women/Juniors, social, join CTA) + white main bar with logo and a two-tier menu (label + small sub-label).
- **Hero**: full-bleed black, huge uppercase headline, diagonal green slash, angled photo, angled bottom edge; CTAs are angled-corner buttons with uppercase text.
- **Modules**: green promo band with one imperative headline + CTA; next-match block in black; news cards (image, date, category, headline, "Read more", "All news" link); results list beside standings; three image tiles; sponsors in tiers (main / partners); black footer with three brand values, contact block, social row, legal bar.
- **Shape language**: square corners (2px max), heavy uppercase Saira headings, thick black rules under section titles, green used for accents and active states only.
- Arabic/RTL: uppercase and letter-spacing disabled, Cairo font, slashes and clip-paths mirrored.
- This is an interpretation of the layout and mood, not a copy of the hjk.fi design or assets.

## Visual direction v3 — rounded & simple
Typeface changed to **Nunito** (rounded terminals) for all Latin text and headings; Arabic stays **Cairo**. Shapes are now soft: pill buttons and chips, 18–24 px rounded cards, sentence-case headings, no diagonal cuts, a calm light-green hero, single-line menu, dark rounded footer. Colours unchanged (green, black, white).

## Hero slider (v0.9.0)
Dark full-width hero with a looping muted video behind four slides fed by live data (club intro, next match, latest result, open training). The bundled video is a generated abstract loop; replace it with club footage by setting the video source in the CMS/site settings (MP4 H.264, under 8 MB, 16:9, no sound needed).


## Typeface (0.15.0)
Latin text and headings use **Figtree** (weights 400–900, Google Fonts / `next/font`). Arabic stays **Cairo**. Chosen from seven options for being round, modern and the easiest to read at small sizes. Replaces Nunito (0.8.0).
