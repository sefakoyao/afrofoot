/**
 * Federation fees shown by the fee finder on the Membership page.
 * UNVERIFIED sample figures taken from the design preview (club sources, Palloliitto 2026 insurance document).
 * Rows with `confirmed: false` are shown with a "To verify" tag. Move these into the database
 * (migration 0021 insurance_prices) and clear the flags once the official table has been checked.
 */
export type Band = 1 | 2 | 3 | 4;
export const BANDS: Record<Band, { label: string; licence: string; note: string | null }> = {
  1: { label: 'fd_b1', licence: '27 €', note: 'fd_i1' },
  2: { label: 'fd_b2', licence: '43 €', note: null },
  3: { label: 'fd_b3', licence: '53 €', note: 'fd_i3' },
  4: { label: 'fd_b3', licence: '53 €', note: 'fd_i4' },
};
export const INSURANCE_ROWS: Record<Band, { label: string; price: string | null; confirmed: boolean }[]> = {
  1: [{ label: 'fdr_2020', price: '10 €', confirmed: true }, { label: 'fdr_2015', price: '70 €', confirmed: true }, { label: 'fdr_oth', price: null, confirmed: false }],
  2: [{ label: 'fdr_0911', price: '230 €', confirmed: true }, { label: 'fdr_oth', price: null, confirmed: false }],
  3: [{ label: 'fdr_am', price: '395 € / 150 €', confirmed: false }, { label: 'fdr_ct', price: '695 € / 325 €', confirmed: false }],
  4: [],
};
