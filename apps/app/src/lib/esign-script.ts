/**
 * Which typed names can be drawn in the handwriting font (Mrs Saint Delafield, src/fonts): every character of the name
 * must be one the font draws (Latin letters with the accents of Finnish, French, Spanish, Polish…). Other names (e.g.
 * Arabic, or letters the font lacks such as ğ, ş, č) are shown in the normal bold font instead. Safe in the browser.
 * The ranges are the font's own character map (regenerate them when the font changes).
 */
const SCRIPT_OK = /^[\u0020-\u007e\u00a1-\u00ac\u00ae-\u00ff\u0131\u0141-\u0142\u0152-\u0153\u0160-\u0161\u0178\u017d-\u017e\u02c6-\u02c7\u02d8-\u02dd\u03c0\u2013-\u2014\u2018-\u201a\u201c-\u201e\u2020\u2022\u2026\u2030\u2039-\u203a\u2044\u2074\u20ac\u2122\u2212\u221a\u222b\u2260\u2264-\u2265\uf8ff\ufb01-\ufb02]+$/;
export const scriptable = (name: string | null | undefined) => !!name && SCRIPT_OK.test(name.trim());
