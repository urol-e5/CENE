// Evidence Table: a searchable, sortable, paginated view of every displayed
// interaction for a species, with CSV export and a row-detail drawer. Reuses the
// same per-species network JSON as the Network Explorer (cached in memory).

import { dataUrl, withBase } from '../lib/site';
import { edgePasses, toCSV } from '../lib/filters';

interface EdgeRec {
  id: string; source: string; target: string; sourceType: string; targetType: string;
  interactionClass: string; region: string | null; direction: string | null;
  pcc: number | null; pValue: number | null; energy: number | null;
  evidence: string; isEpiMiRNA: boolean; isCeRNA: boolean; epiCategory: string | null; conservedMiRNA: boolean | null;
}
interface NodeRec { id: string; type: string; label: string; }

const SPECIES_FULL: Record<string, string> = { Apul: 'Acropora pulchra', Peve: 'Porites evermanni', Ptuh: 'Pocillopora tuahiniensis' };
const cache = new Map<string, { edges: EdgeRec[]; labels: Map<string, NodeRec> }>();
const $ = (id: string) => document.getElementById(id)!;

let rows: EdgeRec[] = [];
let labels = new Map<string, NodeRec>();
let view: EdgeRec[] = [];
let page = 0;
const PAGE = 50;
let sortKey = 'pcc';
let sortDir = -1;

const COLS: { key: keyof EdgeRec | 'miRNA'; label: string; num?: boolean }[] = [
  { key: 'source', label: 'Source' },
  { key: 'target', label: 'Target' },
  { key: 'targetType', label: 'Target type' },
  { key: 'interactionClass', label: 'Interaction' },
  { key: 'region', label: 'Region' },
  { key: 'direction', label: 'Direction' },
  { key: 'pcc', label: 'Pearson r', num: true },
  { key: 'pValue', label: 'p-value', num: true },
  { key: 'energy', label: 'Energy', num: true },
  { key: 'evidence', label: 'Evidence' },
  { key: 'epiCategory', label: 'Epi category' },
];

async function loadSpecies(code: string) {
  if (cache.has(code)) return cache.get(code)!;
  $('evStatus').innerHTML = `<span class="loading" style="padding:0"><span class="spinner"></span>Loading ${SPECIES_FULL[code]}…</span>`;
  const data = await (await fetch(dataUrl(`network/${code}.json`))).json();
  const lab = new Map<string, NodeRec>(data.nodes.map((n: NodeRec) => [n.id, n]));
  const entry = { edges: data.edges as EdgeRec[], labels: lab };
  cache.set(code, entry);
  return entry;
}

function apply() {
  const q = ($('evSearch') as HTMLInputElement).value.trim().toLowerCase();
  const cls = ($('evClass') as HTMLSelectElement).value;
  const dir = ($('evDir') as HTMLSelectElement).value;
  const epi = ($('evEpi') as HTMLInputElement).checked;
  const ce = ($('evCe') as HTMLInputElement).checked;
  view = rows.filter((e) => edgePasses(e, {
    interactionClass: cls, direction: dir, epiOnly: epi, ceOnly: ce,
    search: q, extraText: labels.get(e.target)?.label ?? '',
  }));
  view.sort((a, b) => {
    const av = (a as any)[sortKey], bv = (b as any)[sortKey];
    if (av === null) return 1; if (bv === null) return -1;
    if (typeof av === 'number') return (av - bv) * sortDir;
    return String(av).localeCompare(String(bv)) * sortDir;
  });
  page = 0;
  renderTable();
}

function renderTable() {
  const start = page * PAGE;
  const slice = view.slice(start, start + PAGE);
  const head = COLS.map((c) => {
    const active = c.key === sortKey;
    const arrow = active ? (sortDir === 1 ? '▲' : '▼') : '';
    return `<th data-key="${c.key}" aria-sort="${active ? (sortDir === 1 ? 'ascending' : 'descending') : 'none'}">${c.label} <span class="arrow">${arrow}</span></th>`;
  }).join('');
  const body = slice.map((e, i) => {
    const tl = labels.get(e.target)?.label ?? e.target;
    const dirBadge = e.direction === 'positive' ? '<span class="pill badge-pos">＋</span>' : e.direction === 'negative' ? '<span class="pill badge-neg">－</span>' : '—';
    return `<tr data-idx="${start + i}" tabindex="0">
      <td>${esc(e.source)}</td><td>${esc(tl)}</td><td>${e.targetType}</td>
      <td>${e.interactionClass}</td><td>${e.region ?? '—'}</td><td>${dirBadge}</td>
      <td class="num">${e.pcc?.toFixed(3) ?? '—'}</td><td class="num">${e.pValue !== null ? e.pValue.toExponential(1) : '—'}</td>
      <td class="num">${e.energy ?? '—'}</td><td>${e.evidence === 'binding+coexpression' ? 'binding+coexpr' : 'coexpr'}</td>
      <td>${e.epiCategory ?? ''}</td></tr>`;
  }).join('');
  $('evTable').innerHTML = view.length
    ? `<table class="data"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
    : `<div class="empty">No interactions match these filters. Try widening the search or clearing filters.</div>`;
  const pages = Math.ceil(view.length / PAGE);
  $('evStatus').innerHTML = `<strong>${view.length.toLocaleString()}</strong> interactions${view.length ? ` · page ${page + 1} of ${pages}` : ''}. All predicted (n = 5, unadjusted p).`;
  $('evPager').innerHTML = pages > 1
    ? `<button class="btn btn-outline btn-sm" id="prev" ${page === 0 ? 'disabled' : ''}>← Prev</button>
       <span class="small muted">${start + 1}–${Math.min(start + PAGE, view.length)}</span>
       <button class="btn btn-outline btn-sm" id="next" ${page >= pages - 1 ? 'disabled' : ''}>Next →</button>` : '';
  wireTable();
}

function wireTable() {
  document.querySelectorAll('#evTable th').forEach((th) => th.addEventListener('click', () => {
    const k = (th as HTMLElement).dataset.key!;
    if (k === sortKey) sortDir *= -1; else { sortKey = k; sortDir = k === 'source' || k === 'target' ? 1 : -1; }
    apply();
  }));
  document.querySelectorAll('#evTable tr[data-idx]').forEach((tr) => {
    const open = () => showDetail(view[parseInt((tr as HTMLElement).dataset.idx!, 10)]);
    tr.addEventListener('click', open);
    tr.addEventListener('keydown', (ev) => { if ((ev as KeyboardEvent).key === 'Enter') open(); });
  });
  $('prev')?.addEventListener('click', () => { if (page > 0) { page--; renderTable(); scrollTop(); } });
  $('next')?.addEventListener('click', () => { page++; renderTable(); scrollTop(); });
}
function scrollTop() { $('evTable').scrollIntoView({ behavior: 'smooth', block: 'start' }); }

function showDetail(e: EdgeRec) {
  const code = ($('evSpecies') as HTMLSelectElement).value;
  const tl = labels.get(e.target)?.label ?? e.target;
  const seed = e.sourceType === 'miRNA' ? e.source : e.target;
  const rowsHtml: [string, string][] = [
    ['Source', `${e.source} (${e.sourceType})`], ['Target', `${tl} (${e.targetType})`],
    ['Interaction', e.interactionClass], ['Binding region', e.region ?? '— (coexpression only)'],
    ['Direction', e.direction ?? '—'], ['Pearson r', e.pcc?.toFixed(4) ?? '—'],
    ['p-value', e.pValue !== null ? e.pValue.toExponential(2) : '—'], ['Energy', e.energy !== null ? `${e.energy} kcal/mol` : '—'],
    ['Evidence', e.evidence], ['Epi-miRNA', e.isEpiMiRNA ? 'yes' : 'no'], ['ceRNA-related', e.isCeRNA ? 'yes' : 'no'],
    ['Epi category', e.epiCategory ?? '—'],
  ];
  const dl = rowsHtml.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('');
  $('evDetail').innerHTML = `
    <div class="flex between"><strong>Interaction detail</strong><button class="btn btn-outline btn-sm" id="evClose">Close</button></div>
    <dl class="dl">${dl}</dl>
    <p class="small">Source file: <code>15-miRNA-mRNA-lncRNA-network-ceRNA/${code}_edges…csv</code></p>
    <a class="btn btn-sm" href="${withBase(`/network?sp=${code}&seed=${encodeURIComponent(seed)}`)}">Open in Network Explorer →</a>`;
  ($('evDetail') as HTMLElement).hidden = false;
  $('evClose')?.addEventListener('click', () => (($('evDetail') as HTMLElement).hidden = true));
  ($('evDetail') as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function exportCSV() {
  const header = ['species', ...COLS.map((c) => c.label), 'ceRNA', 'epi_miRNA', 'conserved_miRNA', 'source_file'];
  const code = ($('evSpecies') as HTMLSelectElement).value;
  const rowsOut = view.map((e) => [SPECIES_FULL[code], e.source, labels.get(e.target)?.label ?? e.target, e.targetType,
    e.interactionClass, e.region ?? '', e.direction ?? '', e.pcc ?? '', e.pValue ?? '', e.energy ?? '', e.evidence,
    e.epiCategory ?? '', e.isCeRNA, e.isEpiMiRNA, e.conservedMiRNA ?? '', `15-...ceRNA/${code}_edges`]);
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(toCSV(header, rowsOut));
  a.download = `evidence-${code}.csv`; a.click();
}

function esc(s: string) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!)); }
function debounce<T extends (...a: any[]) => void>(fn: T, ms = 250) { let t: number; return (...a: Parameters<T>) => { clearTimeout(t); t = window.setTimeout(() => fn(...a), ms); }; }

async function switchSpecies() {
  const code = ($('evSpecies') as HTMLSelectElement).value;
  const d = await loadSpecies(code);
  rows = d.edges; labels = d.labels;
  apply();
}

async function init() {
  $('evSpecies').addEventListener('change', switchSpecies);
  $('evSearch').addEventListener('input', debounce(apply));
  ['evClass', 'evDir'].forEach((id) => $(id).addEventListener('change', apply));
  ['evEpi', 'evCe'].forEach((id) => $(id).addEventListener('change', apply));
  $('evCsv').addEventListener('click', exportCSV);
  // Deep-link support: ?sp=Ptuh
  const p = new URLSearchParams(location.search);
  if (p.get('sp')) ($('evSpecies') as HTMLSelectElement).value = p.get('sp')!;
  await switchSpecies();
}
init().catch((e) => ($('evStatus').textContent = 'Failed to load: ' + e.message));
