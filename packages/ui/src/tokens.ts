/**
 * Afro Foot design tokens — single source of truth.
 * BRAND: colours of the official Afro Foot Club logo — green, black and white/ivory — on a LIGHT background. No yellow. Green #3DAF2C is sampled from the logo file
 * (see docs/01-design-system.md). Changing a value here re-themes both apps.
 */
export const colors = {
  ink:   { 950: '#0A0A0A', 900: '#101010', 850: '#161616', 800: '#1C1C1C', 700: '#2A2A2A', 600: '#3A3A3A', 500: '#6E6E6E', 400: '#9A9A9A', 300: '#C4C4C4' },
  // green-500 is sampled from the official logo (#3DAF2C). green-600+ are darker steps that keep text readable on white.
  green:  { 100: '#E3F5DF', 200: '#C2E8BA', 300: '#8FD582', 400: '#66C458', 500: '#3DAF2C', 600: '#2A8A1C', 700: '#1F6B14', 800: '#164E0E' },
  paper: { 50: '#FFFFFF', 100: '#F7F6F0', 200: '#E3E1D6' },
  status: { success: '#3FA56B', warning: '#B7791F', danger: '#D6513F', info: '#5B8DEF' },
} as const;

export const fonts = {
  display: "var(--font-display), Figtree, 'Exo 2', system-ui, sans-serif",   // rounded modern sans (Figtree)
  arabic: "var(--font-arabic), Cairo, Tajawal, system-ui, sans-serif",
  body: "var(--font-body), Inter, system-ui, sans-serif",
} as const;

/** Four experiences share components but differ in density, accent usage and navigation. */
export const surfaces = {
  public: { density: 'airy',    nav: 'top',            note: 'editorial, large imagery, green as brand' },
  admin:  { density: 'compact', nav: 'sidebar',        note: 'tables, filters, bulk actions, desktop-first' },
  coach:  { density: 'comfortable', nav: 'bottom-tabs', note: 'one-handed, pitch-side, quick attendance and squads' },
  player: { density: 'comfortable', nav: 'bottom-tabs', note: 'personal card, schedule, availability replies' },
} as const;
export type Surface = keyof typeof surfaces;
