'use client';

/** The drop-down itself: submits its form as soon as a language is chosen. */
export function LanguageSelect({ current, label, tone, options }: { current: string; label: string; tone: 'dark' | 'light'; options: { value: string; label: string; short: string }[] }) {
  const colours = tone === 'dark' ? 'border-white/40 bg-ink-950 text-white' : 'border-line bg-raised text-fg';
  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">{label}</span>
      <svg aria-hidden="true" viewBox="0 0 24 24" className={`pointer-events-none absolute start-3 size-4 ${tone === 'dark' ? 'text-white' : 'text-fg'}`} fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z" />
      </svg>
      {/* keyed by the language: React resets the form after the action, a fresh select keeps the new choice */}
      <select key={current} name="locale" defaultValue={current} data-language-select
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className={`min-h-9 cursor-pointer appearance-none rounded-full border py-1 pe-8 ps-9 text-sm font-bold hover:border-accent focus:border-accent ${colours}`}>
        {options.map((o) => <option key={o.value} value={o.value} lang={o.value}>{o.label}</option>)}
      </select>
      <svg aria-hidden="true" viewBox="0 0 24 24" className={`pointer-events-none absolute end-3 size-3.5 ${tone === 'dark' ? 'text-white' : 'text-fg'}`} fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" /></svg>
    </label>
  );
}
