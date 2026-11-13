/** Build a plain { key: text } object from the site translations so client components get their text as props. */
export function pick(t: (key: string) => string, keys: readonly string[]): Record<string, string> {
  return Object.fromEntries(keys.map((k) => [k, t(k)]));
}

export const FORM_KEYS = [
  'none', 'position_gk', 'position_df', 'position_mf', 'position_fw', 'tr_first', 'tr_last', 'tr_dob', 'tr_pos', 'tr_prev', 'tr_url', 'tr_url_h',
  'tr_email', 'tr_phone', 'tr_g', 'tr_gn', 'tr_gp', 'tr_msg', 'tr_consent', 'tr_send', 'tr_ok', 'tr_req', 'tr_e_req', 'tr_e_mail', 'tr_e_url', 'tr_e_age',
  'tr_e_g', 'tr_e_c', 'ph_hint', 'ph_err', 'ph_zero', 'dp_open', 'dp_today', 'dp_clear', 'dp_prev', 'dp_next', 'dp_month', 'dp_year', 'dp_close',
  'en_s1', 'en_s2', 'en_s3', 'en_s4', 'en_nat', 'en_addr', 'en_city', 'en_plan', 'en_terms', 'en_priv', 'en_photo', 'en_pub', 'en_next', 'en_back',
  'en_submit', 'en_done_h', 'en_done', 'en_sum', 'en_e_plan', 'en_e_terms', 'en_step', 'per_m', 'per_q', 'per_y', 'm_mp', 'm_wire', 'm_inv', 'pay_method',
  'ct_name', 'ct_topic', 'ct_t_g', 'ct_t_j', 'ct_t_p', 'ct_t_m', 'ct_send', 'ct_ok', 'ct_err',
  'inv_plan', 'inv_o_m', 'inv_o_q', 'inv_o_y', 'inv_phone', 'inv_player', 'inv_addr', 'inv_zip', 'inv_city', 'inv_ref', 'inv_consent', 'inv_send', 'inv_ok', 'inv_err',
  'sp_company', 'sp_contact', 'sp_pkg', 'sp_send', 'sp_ok', 'sp_err',
] as const;

export const FEE_KEYS = [
  'fd_age', 'fd_a1', 'fd_a2', 'fd_a3', 'fd_a4', 'fd_lic', 'fd_ins', 'fd_b1', 'fd_b2', 'fd_b3', 'fd_i1', 'fd_i3', 'fd_i4', 'fd_o1', 'fd_o2', 'fd_o3', 'fd_o4', 'fd_o5',
  'fd_note', 'fd_link', 'fd_seelist', 'fd_conf', 'fd_ver', 'fd_yr', 'fd_tbl_note', 'fdr_2020', 'fdr_2015', 'fdr_0911', 'fdr_oth', 'fdr_am', 'fdr_ct',
] as const;
