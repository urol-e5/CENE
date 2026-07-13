// Main data build: vendored CSV -> browser-ready JSON in public/data/.
// Retains original identifiers, normalizes column names, validates required
// columns, reports (never silently drops) missing fields, and writes a
// data manifest, data dictionaries, and a build summary with row counts.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import {
  SRC, OUT, SPECIES, SPECIES_BY_CODE, SPECIES_NAME_TO_CODE,
  MANUSCRIPT_STATS, SHARED_STATS, EPI_CATEGORIES,
  readCSV, num, round, isConservedMiRNA, miRNAfamily,
} from './lib.mjs';

const buildDate = new Date().toISOString();
const report = { warnings: [], datasets: [] };
const ensure = (p) => mkdirSync(p, { recursive: true });
const writeJSON = (rel, obj) => {
  const path = `${OUT}${rel}`;
  ensure(path.slice(0, path.lastIndexOf('/')));
  writeFileSync(path, JSON.stringify(obj));
  return { rel, bytes: Buffer.byteLength(JSON.stringify(obj)) };
};
const warn = (m) => { report.warnings.push(m); console.warn('  ⚠ ' + m); };

ensure(OUT);
console.log('Building web data →', OUT);

// ---------------------------------------------------------------------------
// 1. Epigenetic-machinery target table (self-contained; drives the epi explorer
//    and the gene→category / gene→protein joins used elsewhere).
// ---------------------------------------------------------------------------
const machRows = readCSV('epimachinery/miRNAtargets_mach.csv');
// key: `${code}|${targetId}` -> {gene, category}
const epiByTarget = new Map();
const epiTargets = [];
for (const r of machRows) {
  const code = SPECIES_NAME_TO_CODE[r.species?.trim()] ?? null;
  if (!code) { warn(`epimachinery: unknown species "${r.species}"`); continue; }
  // Normalize the one source label that differs from the manuscript wording.
  const category = (r.category || '').trim().replace(/^Histone modification and variants$/, 'Histone modification & variants');
  if (category && !EPI_CATEGORIES.includes(category)) warn(`epimachinery: unlisted category "${category}"`);
  const rec = {
    species: code,
    target: r.target,
    gene: r.gene,
    proteinShort: (r.gene || '').split(';')[0].replace(/-\d+$/, '').trim(),
    category,
    miRNA: r.given_miRNA_name,
    conservedMiRNA: isConservedMiRNA(r.given_miRNA_name || ''),
    pcc: round(num(r['PCC.cor'])),
    pValue: round(num(r.p_value), 6),
    direction: num(r['PCC.cor']) === null ? null : (num(r['PCC.cor']) >= 0 ? 'positive' : 'negative'),
  };
  epiTargets.push(rec);
  epiByTarget.set(`${code}|${r.target}`, { gene: rec.proteinShort, category });
}

// Category summary (counts + direction split) per species and overall.
const epiCategorySummary = {};
for (const c of EPI_CATEGORIES) epiCategorySummary[c] = { total: 0, positive: 0, negative: 0, bySpecies: { Apul: 0, Peve: 0, Ptuh: 0 } };
for (const t of epiTargets) {
  const c = epiCategorySummary[t.category];
  if (!c) continue;
  c.total++;
  if (t.direction === 'positive') c.positive++; else if (t.direction === 'negative') c.negative++;
  c.bySpecies[t.species]++;
}
report.datasets.push({ name: 'epimachinery-targets', rows: epiTargets.length });

// ---------------------------------------------------------------------------
// 2. Per-species networks (nodes + denormalized edges).
// ---------------------------------------------------------------------------
const networkStats = {};
const files = [];
for (const sp of SPECIES) {
  const code = sp.code;
  const nodeRows = readCSV(`network/${code}_nodes_p0.05.csv`);
  const edgeRows = readCSV(`network/${code}_edges_p0.05.csv`);

  // Build node index.
  const nodeById = new Map();
  const nodes = [];
  for (const r of nodeRows) {
    const id = r.id;
    if (!id) { warn(`${code} nodes: row with empty id`); continue; }
    if (nodeById.has(id)) { warn(`${code} nodes: duplicate id ${id}`); continue; }
    const type = r.type; // gene | lncRNA | miRNA
    const status = (r.special_status && r.special_status !== 'NA') ? r.special_status : null;
    const epiJoin = epiByTarget.get(`${code}|${id}`) || null;
    const node = {
      id,
      type,
      status,
      label: type === 'gene' && epiJoin?.gene ? epiJoin.gene : id,
      conserved: type === 'miRNA' ? isConservedMiRNA(id) : null,
      family: type === 'miRNA' ? miRNAfamily(id) : null,
      epiCategory: status === 'epi-machinery' ? (epiJoin?.category ?? null) : null,
      annotation: epiJoin?.gene ?? null,
      degree: 0, inDegree: 0, outDegree: 0,
    };
    nodeById.set(id, node);
    nodes.push(node);
  }

  const typeOf = (id) => nodeById.get(id)?.type ?? null;
  const statusOf = (id) => nodeById.get(id)?.status ?? null;

  // A miRNA is "sequestered" when a candidate ceRNA lncRNA is predicted to bind
  // it. Its miRNA→mRNA edges complete the ceRNA triad (lncRNA → miRNA → mRNA),
  // so we flag them as ceRNA edges too — otherwise the "ceRNA only" filter shows
  // just the lncRNA and miRNA and omits the mRNA the miRNA targets (issue #1).
  const ceRNAsequesteredMiRNAs = new Set();
  for (const r of edgeRows) {
    const sN = nodeById.get(r.source), tN = nodeById.get(r.target);
    if (!sN || !tN) continue;
    if (sN.type === 'miRNA' && tN.type === 'lncRNA' && tN.status === 'ceRNA') ceRNAsequesteredMiRNAs.add(sN.id);
    else if (tN.type === 'miRNA' && sN.type === 'lncRNA' && sN.status === 'ceRNA') ceRNAsequesteredMiRNAs.add(tN.id);
  }

  const edges = [];
  let missingEndpoint = 0;
  for (let i = 0; i < edgeRows.length; i++) {
    const r = edgeRows[i];
    const source = r.source, target = r.target;
    const sN = nodeById.get(source), tN = nodeById.get(target);
    if (!sN || !tN) { missingEndpoint++; continue; }
    const sType = sN.type, tType = tN.type;
    const rawRegion = (r.region && r.region !== 'NA') ? r.region : null;

    // Classify interaction by the pair of node types.
    const set = new Set([sType, tType]);
    let interactionClass;
    if (set.has('miRNA') && set.has('gene')) interactionClass = 'miRNA-mRNA';
    else if (set.has('miRNA') && set.has('lncRNA')) interactionClass = 'miRNA-lncRNA';
    else interactionClass = 'lncRNA-mRNA';

    // `region` is the predicted miRNA binding region (3UTR/5UTR/CDS/lncRNA).
    // The source tags lncRNA–mRNA coexpression pairs with the sentinel
    // "lncRNA_mRNA" — a pair-type label, not a binding region — so normalize it
    // to null. Keeping the sentinel makes these edges fail the region filter in
    // the Network Explorer, hiding all lncRNA–mRNA coexpression edges (issue #2).
    const region = interactionClass === 'lncRNA-mRNA' ? null : rawRegion;

    const pccDir = num(r.PCC_direction);
    const direction = pccDir === null ? null : (pccDir >= 0 ? 'positive' : 'negative');
    const support = (r.interaction_support || '').toLowerCase();
    const evidence = support.includes('binding') ? 'binding+coexpression' : 'coexpression';

    // Epi-miRNA edge: a miRNA targeting an epi-machinery transcript.
    const isEpiMiRNA = interactionClass === 'miRNA-mRNA'
      && ((sType === 'miRNA' && statusOf(target) === 'epi-machinery')
        || (tType === 'miRNA' && statusOf(source) === 'epi-machinery'));
    const miRNAendpoint = sType === 'miRNA' ? sN : (tType === 'miRNA' ? tN : null);
    // A ceRNA edge is one directly touching a candidate ceRNA lncRNA (the sponge
    // binding + its coexpression), OR a miRNA→mRNA edge of a sequestered miRNA —
    // the third leg of the lncRNA → miRNA → mRNA triad (issue #1).
    const isCeRNA = sN.status === 'ceRNA' || tN.status === 'ceRNA'
      || (interactionClass === 'miRNA-mRNA' && miRNAendpoint !== null && ceRNAsequesteredMiRNAs.has(miRNAendpoint.id));
    const epiGeneId = statusOf(target) === 'epi-machinery' ? target : (statusOf(source) === 'epi-machinery' ? source : null);
    const epiCategory = epiGeneId ? (epiByTarget.get(`${code}|${epiGeneId}`)?.category ?? null) : null;

    edges.push({
      id: `${code}-e${i}`,
      source, target, sourceType: sType, targetType: tType,
      interactionClass, region, direction,
      pcc: round(num(r['PCC.cor'])),
      pValue: round(num(r.p_value), 6),
      energy: round(num(r.energy), 2),
      bpShared: num(r.total_bp_shared),
      querySim: r.query_similar || null,
      subjectSim: r.subject_similar || null,
      alignment: r.Alignment && r.Alignment !== 'NA' ? r.Alignment : null,
      evidence,
      isEpiMiRNA,
      isCeRNA,
      epiCategory,
      conservedMiRNA: miRNAendpoint ? miRNAendpoint.conserved : null,
    });

    // degree bookkeeping
    sN.degree++; tN.degree++; sN.outDegree++; tN.inDegree++;
  }
  if (missingEndpoint) warn(`${code} edges: ${missingEndpoint} edges reference a node absent from the node table (dropped from graph, reported here)`);

  writeJSON(`network/${code}.json`, {
    species: { code, name: sp.name, short: sp.short },
    meta: { pThreshold: 0.05, nodeCount: nodes.length, edgeCount: edges.length, droppedEdges: missingEndpoint },
    nodes, edges,
  });
  files.push(`network/${code}.json`);

  // Per-species network stats for the summary/cross-species views.
  const count = (pred) => nodes.filter(pred).length;
  networkStats[code] = {
    nodes: nodes.length,
    edges: edges.length,
    miRNAnodes: count((n) => n.type === 'miRNA'),
    lncRNAnodes: count((n) => n.type === 'lncRNA'),
    geneNodes: count((n) => n.type === 'gene'),
    ceRNAnodes: count((n) => n.status === 'ceRNA'),
    epiMachineryNodes: count((n) => n.status === 'epi-machinery'),
    epiMiRNAnodes: count((n) => n.status === 'epi-miRNA'),
    conservedMiRNAnodes: count((n) => n.type === 'miRNA' && n.conserved),
    edgesByClass: {
      'miRNA-mRNA': edges.filter((e) => e.interactionClass === 'miRNA-mRNA').length,
      'miRNA-lncRNA': edges.filter((e) => e.interactionClass === 'miRNA-lncRNA').length,
      'lncRNA-mRNA': edges.filter((e) => e.interactionClass === 'lncRNA-mRNA').length,
    },
    edgesByDirection: {
      positive: edges.filter((e) => e.direction === 'positive').length,
      negative: edges.filter((e) => e.direction === 'negative').length,
    },
    edgesByRegion: ['3UTR', '5UTR', 'CDS', 'lncRNA'].reduce((a, reg) => {
      a[reg] = edges.filter((e) => e.region === reg).length; return a;
    }, {}),
  };
  report.datasets.push({ name: `network-${code}`, rows: nodes.length + edges.length });
  console.log(`  ✓ ${code}: ${nodes.length} nodes, ${edges.length} edges`);
}

// ---------------------------------------------------------------------------
// 3. Methylation (global, per sample + manuscript feature-level context).
// ---------------------------------------------------------------------------
const methylation = { species: {}, featureNote: null, orthogroups: {} };
for (const sp of SPECIES) {
  const raw = readFileSync(`${SRC}methylation/${sp.code}_global_methylation_levels.txt`, 'utf8').trim();
  const samples = raw.split('\n').map((l) => {
    const [id, v] = l.trim().split(/\s+/);
    return { sample: id, methylation: round(num(v) * 100, 3) };
  });
  const mean = round(samples.reduce((a, s) => a + s.methylation, 0) / samples.length, 3);
  methylation.species[sp.code] = {
    globalCpGmethylationPct: MANUSCRIPT_STATS[sp.code].globalCpGmethylationPct,
    meanOfSamplesPct: mean,
    wgbsMappingPct: MANUSCRIPT_STATS[sp.code].wgbsMappingPct,
    samples,
    orthogroupsUnique: MANUSCRIPT_STATS[sp.code].methylationOrthogroupsUnique,
  };
}
methylation.orthogroups = {
  conservedAllThree: SHARED_STATS.methylationOrthogroupsConserved,
  sharedApulPeve: 510,
  uniqueApul: MANUSCRIPT_STATS.Apul.methylationOrthogroupsUnique,
  uniquePeve: MANUSCRIPT_STATS.Peve.methylationOrthogroupsUnique,
  uniquePtuh: MANUSCRIPT_STATS.Ptuh.methylationOrthogroupsUnique,
};
methylation.featureNote =
  'DNA methylation was enriched in gene bodies (introns & exons) and depleted in promoter '
  + 'regions (5′UTR) in all three species, consistent with other invertebrates. CpGs within '
  + 'transposable elements showed higher mean methylation than non-TE CpGs. miRNA and lncRNA '
  + 'loci were predominantly lowly methylated. Per-feature mean methylation values are reported '
  + 'as a figure in the manuscript (Figure 1C); the numeric per-feature summary table is not '
  + 'present as a machine-readable file in the source repository (see data gaps).';
methylation.featureQualitative = [
  { feature: 'Exon', level: 'moderate–high (gene body)', note: 'exceeded by intronic methylation in A. pulchra & P. evermanni; higher than intronic in P. tuahiniensis' },
  { feature: 'Intron', level: 'moderate–high (gene body)', note: '< 5% in P. tuahiniensis' },
  { feature: '5′UTR (promoter)', level: 'low (depleted)', note: 'promoter depletion in all species' },
  { feature: '3′UTR', level: 'low–moderate', note: null },
  { feature: 'Intergenic', level: 'low', note: null },
  { feature: 'TE in exon', level: 'elevated', note: 'TE CpGs > non-TE CpGs' },
  { feature: 'TE in intron', level: 'elevated', note: 'TE CpGs > non-TE CpGs' },
  { feature: 'TE intergenic', level: 'elevated', note: 'TE CpGs > non-TE CpGs' },
  { feature: 'miRNA loci', level: 'predominantly low', note: null },
  { feature: 'lncRNA loci', level: 'predominantly low', note: null },
];
writeJSON('methylation.json', methylation);
files.push('methylation.json');
report.datasets.push({ name: 'methylation', rows: SPECIES.length * 5 });

// ---------------------------------------------------------------------------
// 4. Cross-species summary (cards + chart data).
// ---------------------------------------------------------------------------
const summary = {
  species: SPECIES.map((s) => ({ code: s.code, name: s.name, short: s.short, ...s })),
  shared: SHARED_STATS,
  cards: {},
  charts: {},
};
for (const sp of SPECIES) {
  const m = MANUSCRIPT_STATS[sp.code];
  summary.cards[sp.code] = {
    miRNAs: m.miRNAs,
    lncRNAs: m.lncRNAs,
    globalCpGmethylationPct: m.globalCpGmethylationPct,
    predictedMiRNAmRNA: m.predictedMiRNAmRNA,
    sigCoexprMiRNAmRNA: m.sigCoexprMiRNAmRNA,
    miRNAlncRNAinteractions: m.miRNAlncRNAinteractions,
    ceRNAlncRNAs: m.ceRNAlncRNAs,
    ceRNAmiRNAs: m.ceRNAmiRNAs,
    epiMiRNAtargetPairs: m.epiMiRNAtargetPairs,
    epiMiRNAtargetPct: m.epiMiRNAtargetPct,
    meanPropPositiveTargets: m.meanPropPositiveTargets,
    proteinCodingGenes: sp.proteinCodingGenes,
    // observed from the loaded (p<0.05) network for cross-check
    networkNodes: networkStats[sp.code].nodes,
    networkEdges: networkStats[sp.code].edges,
  };
}
summary.charts.miRNAcounts = SPECIES.map((s) => ({ code: s.code, value: MANUSCRIPT_STATS[s.code].miRNAs }));
summary.charts.lncRNAcounts = SPECIES.map((s) => ({ code: s.code, value: MANUSCRIPT_STATS[s.code].lncRNAs }));
summary.charts.methylation = SPECIES.map((s) => ({ code: s.code, value: MANUSCRIPT_STATS[s.code].globalCpGmethylationPct }));
summary.charts.ceRNA = SPECIES.map((s) => ({ code: s.code, value: MANUSCRIPT_STATS[s.code].ceRNAlncRNAs }));
summary.charts.epiMiRNA = SPECIES.map((s) => ({ code: s.code, value: MANUSCRIPT_STATS[s.code].epiMiRNAtargetPairs }));
summary.charts.propPositive = SPECIES.map((s) => ({ code: s.code, value: MANUSCRIPT_STATS[s.code].meanPropPositiveTargets }));
summary.charts.bindingRegion = SPECIES.map((s) => ({ code: s.code, ...networkStats[s.code].edgesByRegion }));
summary.charts.epiCategories = EPI_CATEGORIES.map((c) => ({
  category: c,
  Apul: epiCategorySummary[c].bySpecies.Apul,
  Peve: epiCategorySummary[c].bySpecies.Peve,
  Ptuh: epiCategorySummary[c].bySpecies.Ptuh,
}));
summary.networkStats = networkStats;
writeJSON('summary.json', summary);
files.push('summary.json');

// ---------------------------------------------------------------------------
// 5. Epigenetic machinery bundle.
// ---------------------------------------------------------------------------
writeJSON('epimachinery.json', {
  categories: EPI_CATEGORIES,
  categorySummary: epiCategorySummary,
  targets: epiTargets,
});
files.push('epimachinery.json');

// ---------------------------------------------------------------------------
// 6. miR-100 cross-species panel (computed from epi targets + network edges + manuscript).
// ---------------------------------------------------------------------------
const mir100 = { note:
  'miR-100 is one of four miRNAs conserved across all three species. Its target coexpression '
  + 'is starkly species-divergent: almost exclusively negative in A. pulchra and P. tuahiniensis, '
  + 'but almost entirely positive in P. evermanni. Sequence conservation does not imply conserved '
  + 'regulatory function.', bySpecies: {} };
for (const sp of SPECIES) {
  const net = JSON.parse(readFileSync(`${OUT}network/${sp.code}.json`, 'utf8'));
  const mir100nodeIds = new Set(net.nodes.filter((n) => n.type === 'miRNA' && n.family === 'mir-100').map((n) => n.id));
  const e = net.edges.filter((x) => mir100nodeIds.has(x.source) || mir100nodeIds.has(x.target));
  const epiTargetsMir100 = epiTargets.filter((t) => t.species === sp.code && miRNAfamily(t.miRNA) === 'mir-100');
  mir100.bySpecies[sp.code] = {
    present: mir100nodeIds.size > 0,
    interactions: e.length,
    positive: e.filter((x) => x.direction === 'positive').length,
    negative: e.filter((x) => x.direction === 'negative').length,
    mrnaTargets: e.filter((x) => x.interactionClass === 'miRNA-mRNA').length,
    lncRNAtargets: e.filter((x) => x.interactionClass === 'miRNA-lncRNA').length,
    cdsBinding: e.filter((x) => x.region === 'CDS').length,
    utrBinding: e.filter((x) => x.region === '3UTR' || x.region === '5UTR').length,
    epiMachineryTargets: epiTargetsMir100.map((t) => ({ gene: t.proteinShort, category: t.category, direction: t.direction })),
    dominantDirection: MANUSCRIPT_STATS[sp.code] && (sp.code === 'Peve' ? 'positive' : 'negative'),
  };
}
// Manuscript-reported functional enrichment for miR-100 targets (Results).
mir100.enrichment = {
  Apul: ['metabolic & transport processes', 'lipid and amino acid handling', 'expression regulation'],
  Peve: ['immune & signaling pathways', 'toll-like receptor signaling', 'calcium ion binding'],
  Ptuh: ['calcium ion binding'],
};
writeJSON('mir100.json', mir100);
files.push('mir100.json');

// ---------------------------------------------------------------------------
// 7. Curated regulatory stories (incl. the TNRC6 ceRNA example).
// ---------------------------------------------------------------------------
const stories = [
  {
    id: 'ptuh-tnrc6',
    title: 'ptuh-mir-novel-4 → TNRC6 (miRISC scaffold), buffered by two lncRNA sponges',
    species: 'Ptuh',
    summary:
      'In P. tuahiniensis, two long non-coding RNAs are predicted to sponge ptuh-mir-novel-4, '
      + 'which putatively represses TNRC6 — an essential scaffold protein of the miRNA-induced '
      + 'silencing complex (miRISC). Sequestration of the miRNA is consistent with indirect '
      + 'derepression of TNRC6, adding a self-referential layer to the miRNA pathway itself.',
    chain: [
      { role: 'lncRNA sponge', label: 'lncRNA sponge #1', type: 'lncRNA' },
      { role: 'lncRNA sponge', label: 'lncRNA sponge #2', type: 'lncRNA' },
      { role: 'miRNA', label: 'ptuh-mir-novel-4', type: 'miRNA', epiMiRNA: true },
      { role: 'mRNA target', label: 'TNRC6', type: 'gene', epiCategory: 'ncRNA biogenesis & silencing' },
      { role: 'function', label: 'miRISC scaffold (proposed derepression)', type: 'function' },
    ],
    evidence: {
      miRNAtoTarget: { relation: 'predicted binding + negative coexpression', direction: 'negative' },
      lncRNAtoMiRNA: { relation: 'predicted binding + negative coexpression (ceRNA signature)', direction: 'negative' },
      interpretation: 'Consistent with lncRNA-mediated derepression of TNRC6; hypothesized, not experimentally validated.',
    },
    seed: 'ptuh-mir-novel-4',
  },
  {
    id: 'apul-mir100-usp',
    title: 'apul-mir-100 → ubiquitin-signaling machinery (USP, TRMT1)',
    species: 'Apul',
    summary:
      'The deeply conserved miR-100 putatively targets ubiquitin-signaling machinery (USP) and '
      + 'RNA-modification machinery (TRMT1) in A. pulchra, with negative coexpression consistent '
      + 'with canonical repression. miR-100 is the only conserved miRNA with epigenetic-machinery '
      + 'targets in multiple species.',
    chain: [
      { role: 'miRNA', label: 'apul-mir-100', type: 'miRNA', conserved: true, epiMiRNA: true },
      { role: 'mRNA target', label: 'USP / TRMT1', type: 'gene', epiCategory: 'Ubiquitin signaling' },
      { role: 'function', label: 'ubiquitin / RNA-modification machinery', type: 'function' },
    ],
    evidence: {
      miRNAtoTarget: { relation: 'predicted binding + negative coexpression', direction: 'negative' },
      interpretation: 'Consistent with canonical miRNA repression of epigenetic machinery; hypothesized.',
    },
    seed: 'apul-mir-100',
  },
];
writeJSON('regulatory-stories.json', stories);
files.push('regulatory-stories.json');

// ---------------------------------------------------------------------------
// 8. Downloads catalogue.
// ---------------------------------------------------------------------------
const DDE = 'https://github.com/urol-e5/deep-dive-expression/blob/main';
const statSize = (rel) => { try { return statBytes(`${SRC}${rel}`); } catch { return null; } };
function statBytes(p) { return existsSync(p) ? readFileSync(p).length : null; }
const downloads = [
  { group: 'Predicted regulatory networks', file: 'network/Apul.json', species: 'Apul', type: 'JSON', kind: 'processed', desc: 'Web-ready A. pulchra multilayer network (nodes + edges, p<0.05).', source: `${DDE}/M-multi-species/output/15-miRNA-mRNA-lncRNA-network-ceRNA` },
  { group: 'Predicted regulatory networks', file: 'network/Peve.json', species: 'Peve', type: 'JSON', kind: 'processed', desc: 'Web-ready P. evermanni multilayer network (nodes + edges, p<0.05).', source: `${DDE}/M-multi-species/output/15-miRNA-mRNA-lncRNA-network-ceRNA` },
  { group: 'Predicted regulatory networks', file: 'network/Ptuh.json', species: 'Ptuh', type: 'JSON', kind: 'processed', desc: 'Web-ready P. tuahiniensis multilayer network (nodes + edges, p<0.05).', source: `${DDE}/M-multi-species/output/15-miRNA-mRNA-lncRNA-network-ceRNA` },
  { group: 'Epi-miRNA targets', file: 'epimachinery.json', species: 'all', type: 'JSON', kind: 'processed', desc: 'miRNAs targeting epigenetic machinery, by category & species (Table 2).', source: `${DDE}/M-multi-species/output/12-miRNA-epimachinery/miRNAtargets_mach.csv` },
  { group: 'Methylation summaries', file: 'methylation.json', species: 'all', type: 'JSON', kind: 'processed', desc: 'Global CpG methylation per sample/species + feature-level context.', source: `${DDE}/M-multi-species/output/10-Cross-Species-Methylation` },
  { group: 'Species summary tables', file: 'summary.json', species: 'all', type: 'JSON', kind: 'processed', desc: 'Cross-species headline statistics (manuscript Results).', source: 'E5 Deep Dive Expression manuscript' },
  { group: 'miRNA–mRNA interactions (raw)', file: null, rawPath: 'interactions/miRanda_PCC_mRNA_sig.csv', species: 'all', type: 'CSV', kind: 'filtered', desc: 'Significant miRanda-predicted miRNA–mRNA pairs with PCC (p<0.05).', source: `${DDE}/M-multi-species/output/20-supplementary-files/miRanda_PCC_mRNA_sig.csv` },
  { group: 'miRNA–lncRNA interactions (raw)', file: null, rawPath: 'interactions/miRanda_PCC_lncRNA_sig.csv', species: 'all', type: 'CSV', kind: 'filtered', desc: 'Significant miRanda-predicted miRNA–lncRNA pairs with PCC (p<0.05).', source: `${DDE}/M-multi-species/output/20-supplementary-files/miRanda_PCC_lncRNA_sig.csv` },
].map((d) => ({ ...d, sizeBytes: d.file ? statBytes(`${OUT}${d.file}`) : (d.rawPath ? statBytes(`${SRC}${d.rawPath}`) : null) }));
writeJSON('downloads.json', downloads);
files.push('downloads.json');

// ---------------------------------------------------------------------------
// 9. Data dictionaries.
// ---------------------------------------------------------------------------
const dictionaries = {
  node: {
    id: 'Original transcript / miRNA identifier (retained verbatim from source).',
    type: 'Node class: miRNA | lncRNA | gene (protein-coding mRNA).',
    status: 'Special role: ceRNA | epi-machinery | epi-miRNA | null.',
    label: 'Display label (epigenetic-machinery genes show protein name).',
    conserved: 'miRNA only: true if it matches a known miRBase/cnidarian family (not "novel").',
    epiCategory: 'Epigenetic-machinery genes only: functional category.',
    degree: 'Total incident edges; inDegree/outDegree split by orientation.',
  },
  edge: {
    source: 'Source node id.', target: 'Target node id.',
    interactionClass: 'miRNA-mRNA | miRNA-lncRNA | lncRNA-mRNA.',
    region: 'Predicted miRNA binding region: 3UTR | 5UTR | CDS | lncRNA (null for lncRNA–mRNA coexpression).',
    direction: 'Sign of Pearson correlation: positive | negative.',
    pcc: 'Pearson correlation coefficient of expression (n=5; unadjusted).',
    pValue: 'Unadjusted p-value of the correlation.',
    energy: 'miRanda predicted binding free energy (kcal/mol; lower = stronger).',
    bpShared: 'Aligned base pairs shared in the predicted duplex.',
    evidence: 'binding+coexpression (predicted binding & significant coexpression) | coexpression (coexpression alone).',
    isEpiMiRNA: 'True if a miRNA targeting an epigenetic-machinery transcript.',
    isCeRNA: 'True if part of a ceRNA triad: an endpoint is a candidate ceRNA lncRNA, or a miRNA→mRNA edge whose miRNA is sequestered by such a lncRNA.',
  },
};
writeJSON('dictionaries/network.json', dictionaries);

// ---------------------------------------------------------------------------
// 10. Manifest + build summary.
// ---------------------------------------------------------------------------
const manifest = {
  generated: buildDate,
  preprocessingScript: 'scripts/build_web_data/build.mjs',
  sourceRepo: 'https://github.com/urol-e5/deep-dive-expression',
  species: SPECIES.map((s) => s.code),
  datasets: [
    ...SPECIES.map((s) => ({
      name: `network-${s.code}`, species: s.code,
      source: `M-multi-species/output/15-miRNA-mRNA-lncRNA-network-ceRNA/${s.code}_{nodes,edges}_..._p0.05.csv`,
      generated: `network/${s.code}.json`,
      rows: networkStats[s.code].nodes + networkStats[s.code].edges,
      columns: ['nodes[id,type,status,...]', 'edges[source,target,interactionClass,region,direction,pcc,pValue,energy,evidence,...]'],
    })),
    { name: 'epimachinery', species: 'all', source: 'M-multi-species/output/12-miRNA-epimachinery/miRNAtargets_mach.csv', generated: 'epimachinery.json', rows: epiTargets.length, columns: ['species', 'target', 'gene', 'category', 'miRNA', 'pcc', 'pValue', 'direction'] },
    { name: 'methylation', species: 'all', source: 'bismark_cutadapt/global_methylation_levels.txt + manuscript', generated: 'methylation.json', rows: SPECIES.length * 5, columns: ['globalCpGmethylationPct', 'samples[]', 'featureQualitative[]', 'orthogroups'] },
    { name: 'summary', species: 'all', source: 'manuscript Results + network stats', generated: 'summary.json', rows: SPECIES.length, columns: ['cards', 'charts', 'networkStats'] },
    { name: 'mir100', species: 'all', source: 'network + epimachinery + manuscript', generated: 'mir100.json', rows: SPECIES.length, columns: ['bySpecies', 'enrichment'] },
    { name: 'regulatory-stories', species: 'all', source: 'manuscript (Fig. 4, Table 2)', generated: 'regulatory-stories.json', rows: stories.length, columns: ['chain', 'evidence'] },
  ],
  transformationDate: buildDate,
};
writeJSON('data-manifest.json', manifest);

const buildSummary = {
  generated: buildDate,
  species: networkStats,
  epimachineryTargets: epiTargets.length,
  regulatoryStories: stories.length,
  files: files.concat(['epimachinery.json', 'downloads.json', 'dictionaries/network.json', 'data-manifest.json']),
  warnings: report.warnings,
};
writeJSON('build-summary.json', buildSummary);

console.log(`\nBuild complete. ${report.warnings.length} warning(s).`);
console.log('Files written to public/data/. Manifest: data-manifest.json');
if (report.warnings.length) console.log('See build-summary.json → warnings for details.');
