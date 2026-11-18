/**
 * Which typed names can be drawn in the handwriting font (Great Vibes, Latin subset in src/fonts): Latin letters with
 * accents (Finnish, French…). Other scripts, e.g. Arabic, are shown in the normal bold font instead. Safe in the browser.
 */
const SCRIPT_OK = /^[ -~ -ſȘ-ț‘-„…]+$/;
export const scriptable = (name: string | null | undefined) => !!name && SCRIPT_OK.test(name.trim());
