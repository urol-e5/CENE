// Re-download the vendored source data from the deep-dive-expression repo.
// Run with `npm run fetch:data`. Requires network access (uses global fetch).
// Existing files in data/source/ are overwritten. Methylation .txt files are
// included. See data/source/README.md for the provenance map.

import { mkdirSync, writeFileSync } from 'node:fs';
import { SRC, SPECIES } from './lib.mjs';

const BASE = 'https://raw.githubusercontent.com/urol-e5/deep-dive-expression/main';
const NET = `${BASE}/M-multi-species/output/15-miRNA-mRNA-lncRNA-network-ceRNA`;

const jobs = [];
for (const sp of SPECIES) {
  for (const p of ['p0.05', 'p0.01']) {
    jobs.push([`${NET}/${sp.code}_nodes_miRNA_mRNA_lncRNA_ceRNA_network_${p}.csv`, `network/${sp.code}_nodes_${p}.csv`]);
    jobs.push([`${NET}/${sp.code}_edges_miRNA_mRNA_lncRNA_ceRNA_network_${p}.csv`, `network/${sp.code}_edges_${p}.csv`]);
  }
}
jobs.push([`${BASE}/M-multi-species/output/12-miRNA-epimachinery/miRNAtargets_mach.csv`, 'epimachinery/miRNAtargets_mach.csv']);
jobs.push([`${BASE}/M-multi-species/output/09.1-epimachinery-ncRNA-protein-expression/ncRNAepimachinery_gene_db_spec.csv`, 'epimachinery/ncRNAepimachinery_gene_db_spec.csv']);
jobs.push([`${BASE}/data/ncRNA_machinery_reference_table.csv`, 'epimachinery/ncRNA_machinery_reference_table.csv']);
jobs.push([`${BASE}/M-multi-species/output/20-supplementary-files/miRanda_PCC_mRNA_sig.csv`, 'interactions/miRanda_PCC_mRNA_sig.csv']);
jobs.push([`${BASE}/M-multi-species/output/20-supplementary-files/miRanda_PCC_lncRNA_sig.csv`, 'interactions/miRanda_PCC_lncRNA_sig.csv']);
const methPaths = {
  Apul: 'D-Apul/output/08-Apul-WGBS', Peve: 'E-Peve/output/12-Peve-WGBS', Ptuh: 'F-Ptuh/output/12-Ptuh-WGBS',
};
for (const sp of SPECIES) {
  jobs.push([`${BASE}/${methPaths[sp.code]}/bismark_cutadapt/global_methylation_levels.txt`, `methylation/${sp.code}_global_methylation_levels.txt`]);
}

let ok = 0, fail = 0;
for (const [url, rel] of jobs) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const path = `${SRC}${rel}`;
    mkdirSync(path.slice(0, path.lastIndexOf('/')), { recursive: true });
    writeFileSync(path, buf);
    ok++; console.log(`  ✓ ${rel} (${buf.length} B)`);
  } catch (e) {
    fail++; console.error(`  ✗ ${rel}: ${e.message}`);
  }
}
console.log(`\nFetched ${ok} file(s), ${fail} failure(s).`);
if (fail) process.exit(1);
