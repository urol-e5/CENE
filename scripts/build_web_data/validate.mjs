// Automated validation of the generated web data. Exits non-zero on failure so
// CI can gate deploys. Run after build.mjs (npm run validate:data).

import { readFileSync, existsSync } from 'node:fs';
import { OUT, SPECIES } from './lib.mjs';

const errors = [];
const notes = [];
const load = (rel) => {
  if (!existsSync(`${OUT}${rel}`)) { errors.push(`missing generated file: ${rel}`); return null; }
  return JSON.parse(readFileSync(`${OUT}${rel}`, 'utf8'));
};

// 1. Expected species represented.
const codes = SPECIES.map((s) => s.code);
for (const code of codes) {
  const net = load(`network/${code}.json`);
  if (!net) continue;

  // 2. Node identifiers unique within species+class.
  const seen = new Map();
  for (const n of net.nodes) {
    const key = `${n.type}|${n.id}`;
    if (seen.has(key)) errors.push(`${code}: duplicate node id within class: ${key}`);
    seen.set(key, true);
  }

  // 3. Edge endpoints exist in node table.
  const ids = new Set(net.nodes.map((n) => n.id));
  let badEndpoints = 0;
  const dupPairs = new Map();
  for (const e of net.edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) badEndpoints++;

    // 4. Correlations numeric and in [-1, 1].
    if (e.pcc !== null && (typeof e.pcc !== 'number' || e.pcc < -1.0001 || e.pcc > 1.0001)) {
      errors.push(`${code}: PCC out of range for ${e.id}: ${e.pcc}`);
    }
    // 5. p-values numeric and in [0, 1].
    if (e.pValue !== null && (typeof e.pValue !== 'number' || e.pValue < 0 || e.pValue > 1)) {
      errors.push(`${code}: p-value out of range for ${e.id}: ${e.pValue}`);
    }
    // 6. Required evidence fields present.
    for (const f of ['source', 'target', 'interactionClass', 'evidence']) {
      if (e[f] === undefined || e[f] === null || e[f] === '') errors.push(`${code}: edge ${e.id} missing ${f}`);
    }
    // duplicate interaction detection (same directed pair + region)
    const pk = `${e.source}>${e.target}|${e.region}`;
    dupPairs.set(pk, (dupPairs.get(pk) || 0) + 1);
  }
  if (badEndpoints) errors.push(`${code}: ${badEndpoints} edges reference missing nodes`);
  const dups = [...dupPairs.values()].filter((v) => v > 1).length;
  if (dups) notes.push(`${code}: ${dups} duplicate interaction pair(s) reported (not an error)`);

  notes.push(`${code}: ${net.nodes.length} nodes, ${net.edges.length} edges validated`);
}

// 7. Manifest + summary present and consistent.
const manifest = load('data-manifest.json');
if (manifest && manifest.species) {
  for (const c of codes) if (!manifest.species.includes(c)) errors.push(`manifest missing species ${c}`);
}
const summary = load('summary.json');
if (summary) {
  for (const c of codes) if (!summary.cards[c]) errors.push(`summary missing cards for ${c}`);
}
const epi = load('epimachinery.json');
if (epi && (!Array.isArray(epi.targets) || epi.targets.length === 0)) errors.push('epimachinery.json has no targets');
const meth = load('methylation.json');
if (meth) for (const c of codes) {
  const v = meth.species[c]?.globalCpGmethylationPct;
  if (typeof v !== 'number' || v < 0 || v > 100) errors.push(`methylation ${c} global value invalid: ${v}`);
}

console.log('— validation notes —');
notes.forEach((n) => console.log('  · ' + n));
if (errors.length) {
  console.error(`\n✗ validation FAILED with ${errors.length} error(s):`);
  errors.forEach((e) => console.error('  ✗ ' + e));
  process.exit(1);
}
console.log(`\n✓ validation passed (${notes.length} checks).`);
