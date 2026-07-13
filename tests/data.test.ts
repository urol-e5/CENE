import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DATA = fileURLToPath(new URL('../public/data/', import.meta.url));
const read = (rel: string) => JSON.parse(readFileSync(`${DATA}${rel}`, 'utf8'));
const CODES = ['Apul', 'Peve', 'Ptuh'] as const;

describe('generated data exists (run `npm run build:data` first)', () => {
  it('has the manifest and summary', () => {
    for (const f of ['data-manifest.json', 'summary.json', 'epimachinery.json', 'methylation.json', 'build-summary.json']) {
      expect(existsSync(`${DATA}${f}`), `${f} should exist`).toBe(true);
    }
  });
});

describe('data manifest validity', () => {
  const m = read('data-manifest.json');
  it('lists all three species', () => {
    for (const c of CODES) expect(m.species).toContain(c);
  });
  it('records a source + generated file for each dataset', () => {
    for (const d of m.datasets) {
      expect(d.source).toBeTruthy();
      expect(d.generated).toBeTruthy();
      expect(typeof d.rows).toBe('number');
    }
  });
});

describe.each(CODES)('network integrity — %s', (code) => {
  const net = read(`network/${code}.json`);
  const ids = new Set<string>(net.nodes.map((n: any) => n.id));

  it('has nodes and edges', () => {
    expect(net.nodes.length).toBeGreaterThan(0);
    expect(net.edges.length).toBeGreaterThan(0);
  });

  it('every edge endpoint exists in the node table', () => {
    for (const e of net.edges) {
      expect(ids.has(e.source), `${e.id} source ${e.source}`).toBe(true);
      expect(ids.has(e.target), `${e.id} target ${e.target}`).toBe(true);
    }
  });

  it('node identifiers are unique within species+class', () => {
    const seen = new Set<string>();
    for (const n of net.nodes) {
      const key = `${n.type}|${n.id}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('correlations are numeric and in [-1, 1]', () => {
    for (const e of net.edges) {
      if (e.pcc !== null) { expect(typeof e.pcc).toBe('number'); expect(e.pcc).toBeGreaterThanOrEqual(-1.0001); expect(e.pcc).toBeLessThanOrEqual(1.0001); }
    }
  });

  it('p-values are numeric and in [0, 1]', () => {
    for (const e of net.edges) {
      if (e.pValue !== null) { expect(typeof e.pValue).toBe('number'); expect(e.pValue).toBeGreaterThanOrEqual(0); expect(e.pValue).toBeLessThanOrEqual(1); }
    }
  });

  it('required evidence fields are never lost', () => {
    for (const e of net.edges) {
      for (const f of ['source', 'target', 'interactionClass', 'evidence']) {
        expect(e[f], `${e.id}.${f}`).toBeTruthy();
      }
    }
  });

  it('lncRNA–mRNA coexpression edges exist and carry no binding region (issue #2)', () => {
    // The source tags these pairs with the sentinel "lncRNA_mRNA"; the Network
    // Explorer region filter only knows 3UTR/5UTR/CDS/lncRNA, so a non-null
    // region here silently hides every lncRNA–mRNA edge. Region must be null.
    const lncMrna = net.edges.filter((e: any) => e.interactionClass === 'lncRNA-mRNA');
    expect(lncMrna.length).toBeGreaterThan(0);
    for (const e of lncMrna) expect(e.region, `${e.id} region`).toBeNull();
  });

  it('every edge region is a filterable binding region or null', () => {
    const REGIONS = new Set(['3UTR', '5UTR', 'CDS', 'lncRNA']);
    for (const e of net.edges) {
      if (e.region !== null) expect(REGIONS.has(e.region), `${e.id} region ${e.region}`).toBe(true);
    }
  });
});

describe('epigenetic machinery', () => {
  const epi = read('epimachinery.json');
  const CATS = new Set(epi.categories);
  it('has the 66 target pairs across valid categories', () => {
    expect(epi.targets.length).toBeGreaterThan(0);
    for (const t of epi.targets) {
      expect(CODES).toContain(t.species);
      expect(CATS.has(t.category), `category ${t.category}`).toBe(true);
    }
  });
  it('DNA-methylation machinery targets are all negatively coexpressed (manuscript claim)', () => {
    const dnam = epi.targets.filter((t: any) => t.category === 'DNA methylation & reading');
    expect(dnam.length).toBeGreaterThan(0);
    for (const t of dnam) expect(t.direction).toBe('negative');
  });
});

describe('summary cards match manuscript headline values', () => {
  const s = read('summary.json');
  it('reports the known miRNA / methylation / ceRNA numbers', () => {
    expect(s.cards.Apul.miRNAs).toBe(39);
    expect(s.cards.Peve.miRNAs).toBe(45);
    expect(s.cards.Ptuh.miRNAs).toBe(37);
    expect(s.cards.Apul.globalCpGmethylationPct).toBe(9.92);
    expect(s.cards.Ptuh.ceRNAlncRNAs).toBe(161);
    expect(s.cards.Apul.sigCoexprMiRNAmRNA).toBe(2222);
  });
});

describe('methylation', () => {
  const m = read('methylation.json');
  it('global CpG values are valid percentages', () => {
    for (const c of CODES) {
      const v = m.species[c].globalCpGmethylationPct;
      expect(typeof v).toBe('number');
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThan(100);
    }
  });
});
