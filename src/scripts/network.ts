// Network Explorer client logic: loads a per-species predicted network, applies
// filters/presets, renders a focused subnetwork with Cytoscape.js, shows node /
// edge detail, and supports export + shareable URLs. Safeguards cap the rendered
// element count so the browser never freezes on the full graph.

import cytoscape from 'cytoscape';
import type { Core, ElementDefinition, NodeSingular, EdgeSingular } from 'cytoscape';
import { dataUrl } from '../lib/site';

interface NodeRec {
  id: string; type: 'miRNA' | 'lncRNA' | 'gene'; status: string | null; label: string;
  conserved: boolean | null; family: string | null; epiCategory: string | null;
  annotation: string | null; degree: number; inDegree: number; outDegree: number;
}
interface EdgeRec {
  id: string; source: string; target: string; sourceType: string; targetType: string;
  interactionClass: 'miRNA-mRNA' | 'miRNA-lncRNA' | 'lncRNA-mRNA';
  region: string | null; direction: 'positive' | 'negative' | null;
  pcc: number | null; pValue: number | null; energy: number | null; bpShared: number | null;
  querySim: string | null; subjectSim: string | null; alignment: string | null;
  evidence: string; isEpiMiRNA: boolean; isCeRNA: boolean; epiCategory: string | null;
  conservedMiRNA: boolean | null;
}
interface NetData { species: { code: string; name: string; short: string }; meta: any; nodes: NodeRec[]; edges: EdgeRec[]; }

const SPECIES_FULL: Record<string, string> = {
  Apul: 'Acropora pulchra', Peve: 'Porites evermanni', Ptuh: 'Pocillopora tuahiniensis',
};
const COL = { miRNA: '#e07a3f', lncRNA: '#3b6ea5', gene: '#6bb0a6', epi: '#7c4fa0', pos: '#2a7f52', neg: '#b8432e' };

const cache = new Map<string, NetData>();
let current: NetData | null = null;
let cy: Core | null = null;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

async function loadSpecies(code: string): Promise<NetData> {
  if (cache.has(code)) return cache.get(code)!;
  setStatus(`Loading ${SPECIES_FULL[code]} network…`, true);
  const res = await fetch(dataUrl(`network/${code}.json`));
  const data = (await res.json()) as NetData;
  cache.set(code, data);
  return data;
}

function setStatus(msg: string, loading = false) {
  const el = $('netStatus');
  el.innerHTML = loading ? `<span class="loading" style="padding:0"><span class="spinner"></span>${msg}</span>` : msg;
}

// ---- filter state ----
interface State {
  species: string; seed: string; miRNA: string; classes: string[]; regions: string[];
  dir: string; minPcc: number; maxP: number; epiCat: string;
  epiOnly: boolean; ceOnly: boolean; conservedOnly: boolean; hideIso: boolean; cap: number;
}
function readState(): State {
  return {
    species: ($('fSpecies') as HTMLSelectElement).value,
    seed: ($('fSearch') as HTMLInputElement).value.trim(),
    miRNA: ($('fMiRNA') as HTMLSelectElement).value,
    classes: [...document.querySelectorAll<HTMLInputElement>('.fClass:checked')].map((e) => e.value),
    regions: [...document.querySelectorAll<HTMLInputElement>('.fRegion:checked')].map((e) => e.value),
    dir: (document.querySelector<HTMLInputElement>('.fDir:checked')?.value) || 'all',
    minPcc: parseFloat(($('fPcc') as HTMLInputElement).value),
    maxP: parseFloat(($('fP') as HTMLInputElement).value),
    epiCat: ($('fEpiCat') as HTMLSelectElement).value,
    epiOnly: ($('fEpiOnly') as HTMLInputElement).checked,
    ceOnly: ($('fCeOnly') as HTMLInputElement).checked,
    conservedOnly: ($('fConservedOnly') as HTMLInputElement).checked,
    hideIso: ($('fHideIso') as HTMLInputElement).checked,
    cap: parseInt(($('fCap') as HTMLInputElement).value, 10),
  };
}

function edgePasses(e: EdgeRec, s: State): boolean {
  if (!s.classes.includes(e.interactionClass)) return false;
  // region filter only constrains miRNA binding edges (those with a region)
  if (e.region && !s.regions.includes(e.region)) return false;
  if (s.dir !== 'all' && e.direction !== s.dir) return false;
  if (e.pcc !== null && Math.abs(e.pcc) < s.minPcc) return false;
  if (e.pValue !== null && e.pValue > s.maxP + 1e-9) return false;
  if (s.epiOnly && !e.isEpiMiRNA) return false;
  if (s.ceOnly && !e.isCeRNA) return false;
  if (s.epiCat && e.epiCategory !== s.epiCat) return false;
  if (s.conservedOnly && e.conservedMiRNA === false) return false;
  if (s.miRNA && e.source !== s.miRNA && e.target !== s.miRNA) return false;
  return true;
}

function build(s: State) {
  if (!current) return;
  const nodeById = new Map(current.nodes.map((n) => [n.id, n]));
  let edges = current.edges.filter((e) => edgePasses(e, s));

  // Seed restriction: keep edges touching the seed node or its 1-hop neighbours.
  if (s.seed) {
    const seedId = resolveSeed(s.seed);
    if (seedId) {
      const nbr = new Set<string>([seedId]);
      for (const e of edges) if (e.source === seedId || e.target === seedId) { nbr.add(e.source); nbr.add(e.target); }
      edges = edges.filter((e) => nbr.has(e.source) && nbr.has(e.target));
    } else {
      setStatus(`No node matches “${s.seed}”. Showing unfiltered result.`);
    }
  }

  // Cap: keep strongest |PCC| edges if over the (node-derived) budget.
  const edgeBudget = s.cap * 2.5;
  let capped = false;
  if (edges.length > edgeBudget) {
    edges = [...edges].sort((a, b) => Math.abs(b.pcc ?? 0) - Math.abs(a.pcc ?? 0)).slice(0, Math.floor(edgeBudget));
    capped = true;
  }

  const usedNodes = new Set<string>();
  for (const e of edges) { usedNodes.add(e.source); usedNodes.add(e.target); }
  let nodes = current.nodes.filter((n) => usedNodes.has(n.id));
  if (nodes.length > s.cap) {
    // keep highest-degree nodes and prune edges to them
    const keep = new Set(nodes.slice().sort((a, b) => b.degree - a.degree).slice(0, s.cap).map((n) => n.id));
    nodes = nodes.filter((n) => keep.has(n.id));
    edges = edges.filter((e) => keep.has(e.source) && keep.has(e.target));
    capped = true;
  }
  if (!s.hideIso) nodes = current.nodes.filter((n) => usedNodes.has(n.id)); // (isolated only appear via seed anyway)

  render(nodes, edges);
  const warn = capped ? ` <strong style="color:var(--coral-deep)">(capped to strongest interactions — narrow filters for the full set)</strong>` : '';
  setStatus(`Showing <strong>${nodes.length}</strong> nodes and <strong>${edges.length}</strong> predicted interactions in <em>${SPECIES_FULL[s.species]}</em>.${warn}`);
  writeURL(s);
}

function resolveSeed(q: string): string | null {
  if (!current) return null;
  const ql = q.toLowerCase();
  let hit = current.nodes.find((n) => n.id.toLowerCase() === ql || n.label.toLowerCase() === ql);
  if (!hit) hit = current.nodes.find((n) => n.id.toLowerCase().includes(ql) || n.label.toLowerCase().includes(ql));
  return hit?.id ?? null;
}

function render(nodes: NodeRec[], edges: EdgeRec[]) {
  const els: ElementDefinition[] = [];
  for (const n of nodes) {
    const isEpi = n.status === 'epi-machinery';
    const shape = isEpi ? 'hexagon' : n.type === 'miRNA' ? 'triangle' : n.type === 'lncRNA' ? 'diamond' : 'ellipse';
    const color = isEpi ? COL.epi : COL[n.type];
    els.push({ data: {
      id: n.id, label: n.label.length > 22 ? n.label.slice(0, 20) + '…' : n.label,
      shape, color, ntype: n.type, status: n.status ?? '', rec: n,
      border: n.status === 'epi-miRNA' ? COL.epi : n.status === 'ceRNA' ? COL.neg : '#0c2330',
      bw: n.status ? 3 : 1,
    } });
  }
  for (const e of edges) {
    els.push({ data: {
      id: e.id, source: e.source, target: e.target,
      color: e.direction === 'positive' ? COL.pos : e.direction === 'negative' ? COL.neg : '#8aa1a9',
      style: e.evidence.includes('binding') ? 'solid' : 'dashed',
      width: 1 + Math.abs(e.pcc ?? 0.5) * 3, rec: e,
    } });
  }

  if (cy) cy.destroy();
  cy = cytoscape({
    container: $('cy'),
    elements: els,
    style: [
      { selector: 'node', style: {
        'background-color': 'data(color)', shape: 'data(shape)' as any,
        label: 'data(label)', 'font-size': 9, color: '#12323d', 'text-valign': 'bottom',
        'text-margin-y': 2, 'border-width': 'data(bw)', 'border-color': 'data(border)',
        width: 20, height: 20, 'text-max-width': '90px', 'text-wrap': 'ellipsis',
      } },
      { selector: 'node[ntype = "miRNA"]', style: { width: 26, height: 26, 'font-weight': 700 } },
      { selector: 'edge', style: {
        'line-color': 'data(color)', 'line-style': 'data(style)' as any, width: 'data(width)',
        'curve-style': 'haystack', opacity: 0.7,
      } },
      { selector: ':selected', style: { 'border-width': 4, 'border-color': '#e6b800', 'line-color': '#e6b800', opacity: 1 } },
      { selector: '.faded', style: { opacity: 0.12 } },
    ],
    layout: { name: 'preset' },
  });

  // Run layout explicitly, then fit — guarantees the graph is centred on load.
  const lay = cy.layout(layoutFor(els.length));
  lay.one('layoutstop', () => cy && cy.fit(undefined, 30));
  lay.run();

  cy.on('tap', 'node', (evt) => showNode(evt.target as NodeSingular));
  cy.on('tap', 'edge', (evt) => showEdge(evt.target as EdgeSingular));
  cy.on('tap', (evt) => { if (evt.target === cy) { cy!.elements().removeClass('faded'); ($('btnExpand') as HTMLButtonElement).disabled = true; } });
}

function layoutFor(count: number) {
  // Concentric keeps miRNAs central; cheap and predictable. Cancel long runs.
  return { name: 'concentric', concentric: (n: NodeSingular) => (n.data('ntype') === 'miRNA' ? 3 : n.data('status') ? 2 : 1),
    levelWidth: () => 1, minNodeSpacing: 18, animate: false } as any;
}

// ---- detail panels ----
function showNode(node: NodeSingular) {
  const n: NodeRec = node.data('rec');
  cy!.elements().addClass('faded');
  node.closedNeighborhood().removeClass('faded');
  ($('btnExpand') as HTMLButtonElement).disabled = false;
  const out = node.outgoers('edge').length, inc = node.incomers('edge').length;
  const typeLabel = n.status === 'epi-machinery' ? 'epigenetic machinery transcript'
    : n.type === 'gene' ? 'protein-coding mRNA' : n.type;
  const rows: [string, string][] = [
    ['Identifier', n.id],
    ['Type', typeLabel],
    ['Species', SPECIES_FULL[current!.species.code]],
  ];
  if (n.type === 'miRNA') rows.push(['Conservation', n.conserved ? 'conserved / known miRBase family' : 'species-specific (novel)']);
  if (n.status) rows.push(['Special role', n.status]);
  if (n.epiCategory) rows.push(['Epi-machinery category', n.epiCategory]);
  if (n.annotation) rows.push(['Annotation', n.annotation]);
  rows.push(['Interactions (shown)', `${node.degree(false)} — ${out} outgoing, ${inc} incoming`]);
  rows.push(['Total degree (full network)', String(n.degree)]);
  $('detail').innerHTML = `
    <div class="flex between"><strong>${escapeHtml(n.label)}</strong><span class="pill">${glyph(n)} ${n.type}</span></div>
    ${dl(rows)}
    <p class="small muted">Neighbourhood highlighted in the graph. Use ＋ Expand to grow it, or click empty space to clear.</p>
    <p class="small">Source: <code>15-miRNA-mRNA-lncRNA-network-ceRNA/${current!.species.code}_nodes…csv</code></p>`;
}

function showEdge(edge: EdgeSingular) {
  const e: EdgeRec = edge.data('rec');
  const s = current!.nodes.find((n) => n.id === e.source);
  const t = current!.nodes.find((n) => n.id === e.target);
  const dirLabel = e.direction === 'positive' ? '<span class="pill badge-pos">positive coexpression</span>'
    : e.direction === 'negative' ? '<span class="pill badge-neg">negative coexpression</span>' : '—';
  const interp = interpret(e, s?.label ?? e.source, t?.label ?? e.target);
  const rows: [string, string][] = [
    ['Source', `${s?.label ?? e.source} (${e.sourceType})`],
    ['Target', `${t?.label ?? e.target} (${e.targetType})`],
    ['Interaction', e.interactionClass.replace('-', ' – ')],
    ['Evidence', e.evidence === 'binding+coexpression' ? 'predicted binding + coexpression' : 'coexpression alone'],
    ['Binding region', e.region ?? '— (coexpression only)'],
    ['Pearson r', e.pcc !== null ? e.pcc.toFixed(4) : '—'],
    ['p-value (unadjusted)', e.pValue !== null ? e.pValue.toExponential(2) : '—'],
    ['Predicted binding energy', e.energy !== null ? `${e.energy} kcal/mol` : '—'],
    ['Aligned bp / similarity', e.bpShared !== null ? `${e.bpShared} bp · q ${e.querySim ?? '—'} / s ${e.subjectSim ?? '—'}` : '—'],
    ['Binding coordinates', e.alignment ?? '—'],
  ];
  if (e.epiCategory) rows.push(['Epi-machinery category', e.epiCategory]);
  $('detail').innerHTML = `
    <div class="flex between"><strong>Interaction</strong>${dirLabel}</div>
    ${dl(rows)}
    <div class="callout info small"><strong>Interpretation.</strong> ${interp}</div>
    <div class="callout warn small">Predicted only — correlation (n = 5, unadjusted p) does not establish causation.</div>
    <p class="small">Source: <code>15-miRNA-mRNA-lncRNA-network-ceRNA/${current!.species.code}_edges…csv</code></p>`;
}

function interpret(e: EdgeRec, src: string, tgt: string): string {
  if (e.interactionClass === 'lncRNA-mRNA') return `The lncRNA and mRNA are ${e.direction}ly coexpressed, consistent with shared regulation or a ceRNA-mediated relationship.`;
  if (e.interactionClass === 'miRNA-lncRNA') return `${src} is predicted to bind ${tgt}; ${e.direction} coexpression ${e.direction === 'negative' ? 'is consistent with sponge-like sequestration' : 'may reflect co-regulation'}.`;
  const canon = e.direction === 'negative' ? 'consistent with canonical miRNA repression of its target' : 'not consistent with simple repression — possibly co-regulation or a non-canonical effect';
  return `${src} is predicted to bind ${tgt}${e.region ? ` in the ${e.region}` : ''}; the ${e.direction} coexpression is ${canon}.`;
}

// ---- helpers ----
function dl(rows: [string, string][]) {
  return `<dl class="dl">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${escapeHtml(v)}</dd>`).join('')}</dl>`;
}
function glyph(n: NodeRec) { return n.status === 'epi-machinery' ? '⬡' : n.type === 'miRNA' ? '△' : n.type === 'lncRNA' ? '◇' : '◯'; }
function escapeHtml(s: string) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!)); }

function renderLegend() {
  $('netLegend').innerHTML = `
    <div class="legend">
      <span class="item"><span aria-hidden="true">△</span> miRNA</span>
      <span class="item"><span aria-hidden="true">◇</span> lncRNA</span>
      <span class="item"><span aria-hidden="true">◯</span> mRNA</span>
      <span class="item"><span aria-hidden="true">⬡</span> epigenetic machinery</span>
      <span class="item"><span class="swatch" style="background:${COL.pos}"></span> positive (line)</span>
      <span class="item"><span class="swatch" style="background:${COL.neg}"></span> negative (line)</span>
      <span class="item">— solid = predicted binding + coexpression</span>
      <span class="item">– – dashed = coexpression alone</span>
      <span class="item">thick border = ceRNA / epi-miRNA / epi-machinery</span>
    </div>`;
}

// ---- URL state ----
function writeURL(s: State) {
  const p = new URLSearchParams();
  p.set('sp', s.species);
  if (s.seed) p.set('seed', s.seed);
  if (s.miRNA) p.set('mir', s.miRNA);
  if (s.dir !== 'all') p.set('dir', s.dir);
  if (s.epiOnly) p.set('epi', '1');
  if (s.ceOnly) p.set('ce', '1');
  if (s.conservedOnly) p.set('cons', '1');
  if (s.epiCat) p.set('cat', s.epiCat);
  p.set('pcc', String(s.minPcc));
  history.replaceState(null, '', `?${p.toString()}`);
}
function applyURL() {
  const p = new URLSearchParams(location.search);
  if (p.get('sp')) ($('fSpecies') as HTMLSelectElement).value = p.get('sp')!;
  if (p.get('seed')) ($('fSearch') as HTMLInputElement).value = p.get('seed')!;
  if (p.get('dir')) (document.querySelector<HTMLInputElement>(`.fDir[value="${p.get('dir')}"]`) || {} as any).checked = true;
  if (p.get('epi')) ($('fEpiOnly') as HTMLInputElement).checked = true;
  if (p.get('ce')) ($('fCeOnly') as HTMLInputElement).checked = true;
  if (p.get('cons')) ($('fConservedOnly') as HTMLInputElement).checked = true;
  if (p.get('pcc')) { ($('fPcc') as HTMLInputElement).value = p.get('pcc')!; $('pccVal').textContent = p.get('pcc'); }
  return { seedFromUrl: p.get('mir') || '', cat: p.get('cat') || '' };
}

// ---- populate species-dependent controls ----
function populateControls() {
  if (!current) return;
  const mirSel = $('fMiRNA') as HTMLSelectElement;
  const miRNAs = current.nodes.filter((n) => n.type === 'miRNA').sort((a, b) => a.id.localeCompare(b.id));
  mirSel.innerHTML = '<option value="">All miRNAs</option>' + miRNAs.map((m) => `<option value="${m.id}">${m.id}${m.conserved ? ' ★' : ''}</option>`).join('');
  const dl2 = $('nodeList') as HTMLDataListElement;
  dl2.innerHTML = current.nodes.slice(0, 4000).map((n) => `<option value="${escapeHtml(n.id)}">${escapeHtml(n.label !== n.id ? n.label : '')}</option>`).join('');
  const cats = [...new Set(current.edges.map((e) => e.epiCategory).filter(Boolean))].sort() as string[];
  $('fEpiCat').innerHTML = '<option value="">Any</option>' + cats.map((c) => `<option value="${c}">${c}</option>`).join('');
}

// ---- presets ----
function resetFilters() {
  ($('fSearch') as HTMLInputElement).value = '';
  ($('fMiRNA') as HTMLSelectElement).value = '';
  document.querySelectorAll<HTMLInputElement>('.fClass, .fRegion').forEach((e) => (e.checked = true));
  (document.querySelector<HTMLInputElement>('.fDir[value="all"]')!).checked = true;
  ['fEpiOnly', 'fCeOnly', 'fConservedOnly'].forEach((id) => (($(id) as HTMLInputElement).checked = false));
  ($('fHideIso') as HTMLInputElement).checked = true;
  ($('fEpiCat') as HTMLSelectElement).value = '';
  ($('fPcc') as HTMLInputElement).value = '0.88'; $('pccVal').textContent = '0.88';
  ($('fP') as HTMLInputElement).value = '0.05'; $('pVal').textContent = '0.05';
  document.querySelectorAll('.chip').forEach((c) => c.removeAttribute('aria-pressed'));
}
function applyPreset(name: string) {
  resetFilters();
  const set = (id: string, v: boolean) => (($(id) as HTMLInputElement).checked = v);
  if (name === 'epimirna') set('fEpiOnly', true);
  else if (name === 'cerna') set('fCeOnly', true);
  else if (name === 'conserved') set('fConservedOnly', true);
  else if (name === 'mir100') ($('fSearch') as HTMLInputElement).value = 'mir-100';
  else if (name === 'negative') (document.querySelector<HTMLInputElement>('.fDir[value="negative"]')!).checked = true;
  else if (name === 'dnameth') { set('fEpiOnly', true); ($('fEpiCat') as HTMLSelectElement).value = 'DNA methylation & reading'; }
  else if (name === 'ncrna') { set('fEpiOnly', true); ($('fEpiCat') as HTMLSelectElement).value = 'ncRNA biogenesis & silencing'; }
  document.querySelector(`.chip[data-preset="${name}"]`)?.setAttribute('aria-pressed', 'true');
  build(readState());
}

// ---- exports ----
function exportPNG() {
  if (!cy) return;
  const png = cy.png({ full: true, scale: 2, bg: '#ffffff' });
  downloadURI(png, `network-${current!.species.code}.png`);
}
function exportSVG() {
  if (!cy) return;
  const pad = 30;
  const bb = cy.elements().boundingBox({});
  const w = bb.w + pad * 2, h = bb.h + pad * 2;
  const tx = -bb.x1 + pad, ty = -bb.y1 + pad;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w.toFixed(0)} ${h.toFixed(0)}" width="${w.toFixed(0)}" height="${h.toFixed(0)}"><rect width="100%" height="100%" fill="#fff"/>`;
  cy.edges().forEach((e) => {
    const p = e.sourceEndpoint(), q = e.targetEndpoint();
    s += `<line x1="${(p.x + tx).toFixed(1)}" y1="${(p.y + ty).toFixed(1)}" x2="${(q.x + tx).toFixed(1)}" y2="${(q.y + ty).toFixed(1)}" stroke="${e.data('color')}" stroke-width="${e.data('width')}" stroke-dasharray="${e.data('style') === 'dashed' ? '4 3' : '0'}" opacity="0.7"/>`;
  });
  cy.nodes().forEach((n) => {
    const p = n.position(), x = p.x + tx, y = p.y + ty, r = n.data('ntype') === 'miRNA' ? 13 : 10;
    s += svgShape(n.data('shape'), x, y, r, n.data('color'), n.data('border'), n.data('bw'));
    s += `<text x="${x.toFixed(1)}" y="${(y + r + 9).toFixed(1)}" font-size="8" text-anchor="middle" fill="#12323d">${escapeHtml(n.data('label'))}</text>`;
  });
  s += '</svg>';
  downloadURI('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s), `network-${current!.species.code}.svg`);
}
function svgShape(shape: string, x: number, y: number, r: number, fill: string, stroke: string, bw: number) {
  const st = `fill="${fill}" stroke="${stroke}" stroke-width="${bw}"`;
  if (shape === 'triangle') return `<polygon points="${x},${y - r} ${x + r},${y + r} ${x - r},${y + r}" ${st}/>`;
  if (shape === 'diamond') return `<polygon points="${x},${y - r} ${x + r},${y} ${x},${y + r} ${x - r},${y}" ${st}/>`;
  if (shape === 'hexagon') return `<polygon points="${x - r},${y - r / 2} ${x},${y - r} ${x + r},${y - r / 2} ${x + r},${y + r / 2} ${x},${y + r} ${x - r},${y + r / 2}" ${st}/>`;
  return `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r}" ${st}/>`;
}
function exportCSV() {
  if (!cy) return;
  const rows = [['source', 'target', 'source_type', 'target_type', 'interaction', 'region', 'direction', 'PCC', 'p_value', 'energy', 'evidence', 'epi_category']];
  cy.edges().forEach((e) => {
    const r: EdgeRec = e.data('rec');
    rows.push([r.source, r.target, r.sourceType, r.targetType, r.interactionClass, r.region ?? '', r.direction ?? '', String(r.pcc ?? ''), String(r.pValue ?? ''), String(r.energy ?? ''), r.evidence, r.epiCategory ?? '']);
  });
  const csv = rows.map((r) => r.map((c) => /[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c).join(',')).join('\n');
  downloadURI('data:text/csv;charset=utf-8,' + encodeURIComponent(csv), `network-${current!.species.code}-edges.csv`);
}
function downloadURI(uri: string, name: string) {
  const a = document.createElement('a'); a.href = uri; a.download = name; document.body.appendChild(a); a.click(); a.remove();
}

// ---- init ----
let pendingCat = '';
async function switchSpecies(rebuild = true) {
  const code = ($('fSpecies') as HTMLSelectElement).value;
  current = await loadSpecies(code);
  populateControls();
  if (pendingCat) { ($('fEpiCat') as HTMLSelectElement).value = pendingCat; pendingCat = ''; }
  if (rebuild) build(readState());
}

function debounce<T extends (...a: any[]) => void>(fn: T, ms = 250) {
  let t: number; return (...a: Parameters<T>) => { clearTimeout(t); t = window.setTimeout(() => fn(...a), ms); };
}

async function init() {
  renderLegend();
  const url = applyURL();
  pendingCat = url.cat;
  // wire controls
  $('applyBtn').addEventListener('click', () => build(readState()));
  $('resetFilters').addEventListener('click', () => { resetFilters(); build(readState()); });
  $('fSpecies').addEventListener('change', () => switchSpecies());
  $('fPcc').addEventListener('input', (e) => ($('pccVal').textContent = (e.target as HTMLInputElement).value));
  $('fP').addEventListener('input', (e) => ($('pVal').textContent = (e.target as HTMLInputElement).value));
  $('fCap').addEventListener('input', (e) => ($('capVal').textContent = (e.target as HTMLInputElement).value));
  $('fSearch').addEventListener('change', debounce(() => build(readState())));
  $('fMiRNA').addEventListener('change', () => build(readState()));
  document.querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => applyPreset((c as HTMLElement).dataset.preset!)));
  $('btnFit').addEventListener('click', () => cy?.fit(undefined, 30));
  $('btnReset').addEventListener('click', () => { cy?.elements().removeClass('faded'); cy?.fit(undefined, 30); });
  $('btnExpand').addEventListener('click', () => { const sel = cy?.$(':selected'); if (sel && sel.length) { sel.closedNeighborhood().removeClass('faded'); } });
  $('btnPng').addEventListener('click', exportPNG);
  $('btnSvg').addEventListener('click', exportSVG);
  $('btnCsv').addEventListener('click', exportCSV);
  $('btnShare').addEventListener('click', async () => {
    writeURL(readState());
    try { await navigator.clipboard.writeText(location.href); setStatus('Shareable link copied to clipboard.'); }
    catch { setStatus(`Shareable link: ${location.href}`); }
  });

  await switchSpecies(false);
  // default preset when arriving with no filters
  if (!location.search) applyPreset('epimirna'); else build(readState());
}

init().catch((e) => setStatus('Failed to load network data: ' + e.message));
