/** Sample sponsors from the design preview. TODO: read from the `sponsors` table (public select is already allowed) once the admin CMS exists. */
export interface Sponsor { name: string; kind: 'sp_main' | 'sp_part'; desc?: string; logo?: { src: string; width: number; height: number } }

export const SPONSORS: Sponsor[] = [
  { name: 'Montel Intergalactic', kind: 'sp_main', desc: 'sp_d1', logo: { src: '/images/montel-logo.png', width: 357, height: 74 } },
  { name: 'Musine', kind: 'sp_part', desc: 'sp_d2' },
  { name: 'Dosmar', kind: 'sp_part', desc: 'sp_d3' },
];

/** The partner strip on the home page also shows the federation. */
export const STRIP: Sponsor[] = [...SPONSORS, { name: 'Palloliitto', kind: 'sp_part', logo: { src: '/images/palloliitto-logo.png', width: 384, height: 269 } }];
