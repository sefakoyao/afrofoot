import type { Config } from 'tailwindcss';
import { colors } from './tokens';

const preset: Partial<Config> = {
    theme: {
    extend: {
      colors: {
        ink: colors.ink, green: colors.green, paper: colors.paper,
        success: colors.status.success, warning: colors.status.warning, danger: colors.status.danger, info: colors.status.info,
        surface: 'rgb(var(--surface) / <alpha-value>)',
        raised: 'rgb(var(--raised) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        fg: 'rgb(var(--fg) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        pitch: 'rgb(var(--pitch) / <alpha-value>)',
        'on-accent': 'rgb(var(--on-accent) / <alpha-value>)',
      },
      fontFamily: { display: ['var(--font-display)', 'Figtree', 'Exo 2', 'sans-serif'], arabic: ['var(--font-arabic)', 'Cairo', 'Tajawal', 'sans-serif'], sans: ['var(--font-body)', 'Inter', 'system-ui', 'sans-serif'] },
      borderRadius: { card: 'var(--radius-card)', control: 'var(--radius-control)' },
      boxShadow: { glow: '0 0 0 1px rgb(61 175 44 / .35), 0 12px 40px -12px rgb(61 175 44 / .25)' },
      backgroundImage: { 'pitch-stripe': 'linear-gradient(90deg, #2A8A1C, #3DAF2C 50%, #8FD582)' },
    },
  },
};
export default preset;
