// Shared site config + helpers usable from both .astro frontmatter and browser
// scripts. BASE_URL is injected by Astro at build time so links/fetches resolve
// correctly under the GitHub Pages subpath (e.g. /CENE/).

export const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

/** Prefix an absolute-from-root path with the deploy base path. */
export function withBase(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${BASE}${p}`;
}

/** Path to a generated data file under public/data/. */
export function dataUrl(rel: string): string {
  return withBase(`/data/${rel}`);
}

export interface SpeciesInfo {
  code: 'Apul' | 'Peve' | 'Ptuh';
  name: string;
  short: string;
  cssVar: string;
}

export const SPECIES: SpeciesInfo[] = [
  { code: 'Apul', name: 'Acropora pulchra', short: 'A. pulchra', cssVar: '--sp-apul' },
  { code: 'Peve', name: 'Porites evermanni', short: 'P. evermanni', cssVar: '--sp-peve' },
  { code: 'Ptuh', name: 'Pocillopora tuahiniensis', short: 'P. tuahiniensis', cssVar: '--sp-ptuh' },
];

export const SPECIES_BY_CODE: Record<string, SpeciesInfo> =
  Object.fromEntries(SPECIES.map((s) => [s.code, s]));

export const SPECIES_COLOR: Record<string, string> = {
  Apul: '#1f7a8c', Peve: '#bf6b3f', Ptuh: '#5b5f97',
};

export const NAV = [
  { href: '/', label: 'Home' },
  { href: '/network', label: 'Network Explorer' },
  { href: '/regulatory-story', label: 'Regulatory Story' },
  { href: '/compare', label: 'Compare Species' },
  { href: '/epigenetic-machinery', label: 'Epi-machinery' },
  { href: '/methylation', label: 'Methylation' },
  { href: '/evidence', label: 'Evidence Table' },
  { href: '/methods', label: 'Methods & Caveats' },
  { href: '/downloads', label: 'Downloads' },
];

export const EXTERNAL = {
  github: 'https://github.com/urol-e5/CENE',
  analysisRepo: 'https://github.com/urol-e5/deep-dive-expression',
  fullNetwork: 'https://gannet.fish.washington.edu/kdurkin1/ravenbackups/deep-dive-expression/M-multi-species/output/15-miRNA-mRNA-lncRNA-network-ceRNA/web_session/#/',
};

export function fmtInt(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return n.toLocaleString('en-US');
}
export function fmtPct(n: number | null | undefined, d = 2): string {
  if (n === null || n === undefined) return '—';
  return `${n.toFixed(d)}%`;
}
export function fmtNum(n: number | null | undefined, d = 3): string {
  if (n === null || n === undefined) return '—';
  return n.toFixed(d);
}
