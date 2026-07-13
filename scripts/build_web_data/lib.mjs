// Shared helpers + manuscript-derived constants for the CENE data build.
// Every numeric constant here is transcribed directly from the manuscript
// "Multi-Layered Epigenetic Regulation in Three Reef-Building Corals" (Results),
// or computed from the vendored source data. Do not invent values.

import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';

export const ROOT = new URL('../../', import.meta.url).pathname;
export const SRC = `${ROOT}data/source/`;
export const OUT = `${ROOT}public/data/`;

// Canonical species metadata. `code` is the short label used in file names,
// `name` the italicized binomial used in UI, `short` the abbreviated form.
export const SPECIES = [
  {
    code: 'Apul',
    name: 'Acropora pulchra',
    short: 'A. pulchra',
    genusColor: 'apul',
    genome: 'Acropora pulchra (Conn et al., 2025; GCA_044231415.1)',
    proteinCodingGenes: 40518,
    genomeSizeMbp: 518,
    n50Mbp: 17.8,
    genomeBrowser: null,
    // Reference genome provenance for the genome-quality comparison table.
    // `assemblySpecies` is the taxon of the assembly used (may differ from the
    // study species — e.g. Ptuh reads were mapped to a P. meandrina genome).
    assemblySpecies: 'Acropora pulchra',
    reference: 'Conn et al., 2025',
    referenceDoi: 'https://doi.org/10.46471/gigabyte.153',
    accession: 'GCA_044231415.1',
  },
  {
    code: 'Peve',
    name: 'Porites evermanni',
    short: 'P. evermanni',
    genusColor: 'peve',
    genome: 'Porites evermanni (Noel et al., 2023; GCA_942486025.1)',
    proteinCodingGenes: 40389,
    genomeSizeMbp: 497,
    n50Mbp: 0.17,
    genomeBrowser: 'https://www.genoscope.cns.fr/corals/genomes.html',
    assemblySpecies: 'Porites evermanni',
    reference: 'Noel et al., 2023',
    referenceDoi: 'https://doi.org/10.1186/s13059-023-02960-7',
    accession: 'GCA_942486025.1',
  },
  {
    code: 'Ptuh',
    name: 'Pocillopora tuahiniensis',
    short: 'P. tuahiniensis',
    genusColor: 'ptuh',
    genome: 'Pocillopora meandrina (Stephens et al., 2022)',
    proteinCodingGenes: 31840,
    genomeSizeMbp: 377,
    n50Mbp: 10,
    genomeBrowser: null,
    assemblySpecies: 'Pocillopora meandrina',
    reference: 'Stephens et al., 2022',
    referenceDoi: 'https://doi.org/10.1093/gigascience/giac098',
    accession: null,
  },
];

export const SPECIES_BY_CODE = Object.fromEntries(SPECIES.map((s) => [s.code, s]));
// Map the long species labels used inside some source tables to our short codes.
export const SPECIES_NAME_TO_CODE = {
  'A. pulchra': 'Apul',
  'P. evermanni': 'Peve',
  'P. tuahiniensis': 'Ptuh',
  Apul: 'Apul',
  Peve: 'Peve',
  Ptuh: 'Ptuh',
};

// Manuscript Results statistics, per species. Sources noted per field group.
export const MANUSCRIPT_STATS = {
  Apul: {
    mrnaRawReads: 226867894,
    mrnaMeanAlignPct: 66.77,
    miRNAs: 39,
    miRNAmeanRPM: 25641,
    miRNAmedianRPM: 2284,
    lncRNAs: 31491,
    lncRNAmeanLenBp: 2397,
    globalCpGmethylationPct: 9.92,
    wgbsMappingPct: 50.88,
    predictedMiRNAmRNA: 49220,
    sigCoexprMiRNAmRNA: 2222,
    miRNAlncRNAinteractions: 564,
    ceRNAlncRNAs: 117,
    ceRNAmiRNAs: 19,
    epiMiRNAtargetPairs: 35,
    epiMiRNAtargetPct: 1.56,
    meanPropPositiveTargets: 0.68,
    methylationOrthogroupsUnique: 1507,
  },
  Peve: {
    mrnaRawReads: 252777262,
    mrnaMeanAlignPct: 86.54,
    miRNAs: 45,
    miRNAmeanRPM: 22222,
    miRNAmedianRPM: 2827,
    lncRNAs: 10090,
    lncRNAmeanLenBp: 2591,
    globalCpGmethylationPct: 7.24,
    wgbsMappingPct: 55.72,
    predictedMiRNAmRNA: 24055,
    sigCoexprMiRNAmRNA: 1267,
    miRNAlncRNAinteractions: 175,
    ceRNAlncRNAs: 41,
    ceRNAmiRNAs: 17,
    epiMiRNAtargetPairs: 15,
    epiMiRNAtargetPct: 1.18,
    meanPropPositiveTargets: 0.49,
    methylationOrthogroupsUnique: 1518,
  },
  Ptuh: {
    mrnaRawReads: 259358086,
    mrnaMeanAlignPct: 59.62,
    miRNAs: 37,
    miRNAmeanRPM: 27027,
    miRNAmedianRPM: 3113,
    lncRNAs: 16153,
    lncRNAmeanLenBp: 3124,
    globalCpGmethylationPct: 4.04,
    wgbsMappingPct: 57.84,
    predictedMiRNAmRNA: 17523,
    sigCoexprMiRNAmRNA: 902,
    miRNAlncRNAinteractions: 564,
    ceRNAlncRNAs: 161,
    ceRNAmiRNAs: 19,
    epiMiRNAtargetPairs: 16,
    epiMiRNAtargetPct: 1.77,
    meanPropPositiveTargets: 0.53,
    methylationOrthogroupsUnique: 226,
  },
};

// Cross-species shared counts (manuscript Results).
export const SHARED_STATS = {
  lncRNAsharedAllThree: 46,
  miRNAconservedAllThree: 4, // miR-100, miR-2036, miR-2023, miR-2025
  conservedMiRNAfamilies: ['mir-100', 'mir-2036', 'mir-2023', 'mir-2025'],
  methylationOrthogroupsConserved: 109,
  epiMiRNAtargetPairsPositive: 37,
  epiMiRNAtargetPairsTotal: 66,
};

// The seven epigenetic-machinery categories used in the manuscript, in order.
export const EPI_CATEGORIES = [
  'DNA methylation & reading',
  'Histone modification & variants',
  'Chromatin signaling',
  'Ubiquitin signaling',
  'RNA modification',
  'ncRNA biogenesis & silencing',
  'ADP-ribosylation',
];

// --- helpers -------------------------------------------------------------

export function readCSV(relPath) {
  const text = readFileSync(`${SRC}${relPath}`, 'utf8');
  return parse(text, { columns: true, skip_empty_lines: true, relax_quotes: true, trim: true });
}

export function num(v) {
  if (v === undefined || v === null || v === '' || v === 'NA') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// A miRNA named "*-mir-novel-*" is species-specific; anything else matches a
// known miRBase / cnidarian family and is treated as conserved/known.
export function isConservedMiRNA(id) {
  return !/novel/i.test(id);
}

// Base family name, e.g. "apul-mir-100" -> "mir-100" (used for conserved match).
export function miRNAfamily(id) {
  const m = id.match(/(mir-[a-z0-9-]+)/i);
  return m ? m[1].toLowerCase() : id.toLowerCase();
}

export function round(n, d = 4) {
  if (n === null || n === undefined) return null;
  const f = 10 ** d;
  return Math.round(n * f) / f;
}
